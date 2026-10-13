'use strict';
/*
 * documenti-core.test.js — le scelte dello 0077 (ADR 0018, punto 1 e scelta 3 (a)),
 * nel core puro `mappai-documenti-core.js`: il nome del file di un documento, la
 * cartella di un documento (per id, P1; per nome solo per le voci vecchie), la voce
 * snella, la voce intera ricostruita dal file, la rilettura identica, il piano della
 * migrazione e la regola «non entra». Niente DOM, niente disco: dati in, dati out.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const DC = require('../public/js/mappai-documenti-core.js');
const FC = require('../public/js/mappai-files-core.js');
const TextUtils = require('../public/js/mappai-text-utils.js');

const P1 = 'proj_1788975818955';
const P2 = 'proj_1788975819999';
const HTML = '<!DOCTYPE html><html><body><h1>Sintesi — Elettricità</h1><p>«Più» è più.</p></body></html>';
const B64PDF = Buffer.from('%PDF-1.4 un foglio di nodi', 'utf8').toString('base64');
const PDF = 'data:application/pdf;filename=generated.pdf;base64,' + B64PDF;
const dec = b64 => Buffer.from(b64, 'base64').toString('utf8');

const voce = (o) => Object.assign({ id: 'doc_1790000000000_1', kind: 'synthesis', title: 'Sintesi — Elettricità', mapName: 'Elettricità',
  cls: '4R', disc: 'Scienze', date: 1790000000000, html: HTML, overLimit: 0, pdf: '' }, o || {});

// ── il nome del file ───────────────────────────────────────────────────────
test('nomeFile: Documenti/<titolo> - <tipo> - <id>.html, e passa da sanitizeVaultRelPath', () => {
  const rel = DC.nomeFile(voce());
  assert.equal(rel, 'Documenti/Sintesi — Elettricità - synthesis - doc_1790000000000_1.html');
  assert.equal(FC.sanitizeVaultRelPath(rel), rel);
  assert.equal(DC.relValido(rel), true);
});

test('nomeFile: un PDF è un .pdf; un titolo con / : e punti finali si pulisce; stessa voce, stesso nome', () => {
  assert.equal(DC.nomeFile(voce({ kind: 'nodesheet', title: 'Foglio nodi', html: '', pdf: PDF })),
    'Documenti/Foglio nodi - nodesheet - doc_1790000000000_1.pdf');
  const r = DC.nomeFile(voce({ title: 'A/B: c?..' }));
  assert.equal(FC.sanitizeVaultRelPath(r), r, 'il nome sopravvive alla guardia dell\'IPC');
  assert.ok(!/[\/:?]/.test(r.slice('Documenti/'.length)));
  assert.equal(DC.nomeFile(voce()), DC.nomeFile(voce({ html: '<p>rigenerato</p>' })), 'rigenerare lo stesso documento riscrive lo stesso file');
  const lungo = DC.nomeFile(voce({ title: 'x'.repeat(400) }));
  assert.ok(lungo.length < 200, 'un titolo lunghissimo non fa un nome da 400 caratteri');
  assert.equal(FC.sanitizeVaultRelPath(lungo), lungo);
  assert.ok(!/^Documenti\/\./.test(DC.nomeFile(voce({ title: '.nascosto' }))), 'niente file nascosti');
});

test('nomeFile: un id che non è un nome di file, o nessun contenuto, → null', () => {
  assert.equal(DC.nomeFile(voce({ id: 'doc_1" onmouseover="x' })), null);
  assert.equal(DC.nomeFile(voce({ id: '../x' })), null);
  assert.equal(DC.nomeFile(voce({ html: '', pdf: '' })), null);
});

test('M9 relValido: solo Documenti/<file>, mai un percorso assoluto o più profondo', () => {
  assert.equal(DC.relValido('Documenti/a.html'), true);
  for (const r of ['/Users/x/Documenti/a.html', 'C:\\Documenti\\a.html', 'Documenti/a/b.html', 'Documenti/../x.html',
    'Materiale Studio/a.html', 'a.html', 'Documenti/', '', null, undefined]) {
    assert.equal(DC.relValido(r), false, String(r));
  }
});

// ── il tipo di contenuto e il PDF ──────────────────────────────────────────
test('tipo: html, pdf in data-URI base64, e niente quando non si sa scrivere un file solo', () => {
  assert.equal(DC.tipo(voce()), 'html');
  assert.equal(DC.tipo(voce({ html: '', pdf: PDF })), 'pdf');
  assert.equal(DC.tipo(voce({ html: '', pdf: 'data:application/pdf,%25PDF' })), null, 'un PDF non base64 resta nel cassetto');
  assert.equal(DC.tipo(voce({ pdf: PDF })), null, 'html e pdf insieme: resta nel cassetto');
  assert.equal(DC.tipo(voce({ html: '', pdf: '' })), null);
});

// ── la voce snella e la voce intera ────────────────────────────────────────
test('M8 voceSnella: niente html né pdf, tiene hasHtml/hasPdf, progetto e rel relativo', () => {
  const v = voce({ progetto: P1 });
  const s = DC.voceSnella(v, DC.nomeFile(v));
  assert.equal('html' in s, false);
  assert.equal('pdf' in s, false);
  assert.equal(s.hasHtml, true);
  assert.equal(s.hasPdf, false);
  assert.equal(s.progetto, P1);
  assert.equal(s.rel, DC.nomeFile(v));
  for (const k of ['id', 'kind', 'title', 'mapName', 'cls', 'disc', 'date', 'overLimit']) assert.deepEqual(s[k], v[k], k);
  assert.ok(JSON.stringify(s).length < 600, 'una voce snella pesa centinaia di byte');
  const p = voce({ html: '', pdf: PDF, kind: 'nodesheet', progetto: P1 });
  const sp = DC.voceSnella(p, DC.nomeFile(p));
  assert.equal(sp.hasPdf, true);
  assert.equal(sp.hasHtml, false);
  assert.ok(!JSON.stringify(sp).includes(B64PDF), 'il PDF non resta nella voce');
});

test('M7 pienaDaFile: la voce di prima, identica — il PDF torna col suo prefisso data:', () => {
  const v = voce({ progetto: P1 });
  assert.deepEqual(DC.pienaDaFile(DC.voceSnella(v, DC.nomeFile(v)), HTML), v);
  const p = voce({ html: '', pdf: PDF, kind: 'nodesheet', progetto: P1 });
  const torna = DC.pienaDaFile(DC.voceSnella(p, DC.nomeFile(p)), B64PDF);
  assert.deepEqual(torna, p);
  assert.ok(torna.pdf.startsWith('data:application/pdf'), 'si riapre con window.open');
  /* una voce snella senza la testa del PDF (scritta a mano) torna comunque un data-URI */
  const s = DC.voceSnella(p, DC.nomeFile(p)); delete s.testaPdf;
  assert.equal(DC.pienaDaFile(s, B64PDF).pdf, 'data:application/pdf;base64,' + B64PDF);
});

// ── la rilettura ───────────────────────────────────────────────────────────
test('M1 rilettaUguale: uguale byte per byte, o no', () => {
  const b = s => Buffer.from(s, 'utf8').toString('base64');
  assert.equal(DC.rilettaUguale(voce(), b(HTML), dec), true);
  assert.equal(DC.rilettaUguale(voce(), b(HTML + ' '), dec), false, 'un byte in più');
  assert.equal(DC.rilettaUguale(voce(), b(HTML.normalize('NFD')), dec), false, 'stessa lettera, altra forma');
  assert.equal(DC.rilettaUguale(voce(), '', dec), false);
  assert.equal(DC.rilettaUguale(voce(), null, dec), false);
  const p = voce({ html: '', pdf: PDF });
  assert.equal(DC.rilettaUguale(p, B64PDF, dec), true);
  assert.equal(DC.rilettaUguale(p, Buffer.from('%PDF-1.4 altro', 'utf8').toString('base64'), dec), false);
});

// ── la cartella per id (P1) ────────────────────────────────────────────────
const V = (fullPath, rootNodeLabel, projectId, extra) => Object.assign({ folderName: fullPath.split('/').pop(), fullPath, rootNodeLabel }, projectId ? { projectId } : {}, extra || {});
const MAPPE = '/Users/prova/Documents/MappAI - file/Mappe';

test('cartellaPerId: la sola cartella con quell\'id; nessuna; due', () => {
  const vs = [V(MAPPE + '/4R/Scienze/Elettricità', 'Elettricità', P1), V(MAPPE + '/4R/Storia/Svizzera', 'Svizzera', P2)];
  const r = DC.cartellaPerId(P1, vs);
  assert.equal(r.esito, 'una');
  assert.equal(r.vault.fullPath, MAPPE + '/4R/Scienze/Elettricità');
  assert.equal(DC.cartellaPerId('proj_1700000000000', vs).esito, 'nessuna');
  /* M13: una copia fatta a mano con lo stesso index.yaml */
  const due = vs.concat([V(MAPPE + '/4A/Scienze/Elettricità', 'Elettricità', P1)]);
  const r2 = DC.cartellaPerId(P1, due);
  assert.equal(r2.esito, 'molte');
  assert.equal(r2.vault, undefined, 'nessuna delle due');
});

test('M12 cartellaPerId: cerca SOLO per id — un omonimo con un altro id non vale', () => {
  const vs = [V(MAPPE + '/4R/Scienze/Elettricità', 'Elettricità', P2)];
  assert.equal(DC.cartellaPerId(P1, vs).esito, 'nessuna');
  /* S-M12d: una cartella SENZA id non è la cartella di nessun documento */
  assert.equal(DC.cartellaPerId(P1, [V(MAPPE + '/4R/Scienze/Elettricità', 'Elettricità', null)]).esito, 'nessuna');
  assert.equal(DC.cartellaPerId(P1, [V(MAPPE + '/a', 'A', null), V(MAPPE + '/b', 'B', P1)]).esito, 'una');
});

test('M14 cartellaPerId e progetto: un id non valido non si accetta', () => {
  const vs = [V(MAPPE + '/x', 'x', 'tutor_ai_projects'), V(MAPPE + '/y', 'y', P1)];
  assert.equal(DC.cartellaPerId('tutor_ai_projects', vs).esito, 'id-non-valido');
  assert.equal(DC.cartellaPerId('', vs).esito, 'id-non-valido');
  assert.equal(DC.progetto('tutor_ai_projects'), '');
  assert.equal(DC.progetto('proj_12'), '');
  assert.equal(DC.progetto(P1), P1);
});

// ── la cartella per nome (solo le voci vecchie) ────────────────────────────
test('M3 cartellaPerNome: una sola cartella, in NFC su entrambi i lati, e con un id valido', () => {
  const nfd = 'Elettricità'.normalize('NFD');
  const vs = [V(MAPPE + '/4R/Scienze/' + nfd, nfd, P1), V(MAPPE + '/4R/Storia/Svizzera', 'Svizzera', P2)];
  const r = DC.cartellaPerNome('Elettricità'.normalize('NFC'), vs, TextUtils.cleanLabel);
  assert.equal(r.esito, 'una', 'NFC contro NFD: la stessa mappa');
  assert.equal(r.progetto, P1);
  assert.equal(r.vault.fullPath, MAPPE + '/4R/Scienze/' + nfd);
});

test('M3 cartellaPerNome: la forma cleanLabel (trappola 25) — «**Elettricità**» trova Elettricità', () => {
  const vs = [V(MAPPE + '/4R/Scienze/Elettricità', '**Elettricità**', P1)];
  assert.equal(DC.cartellaPerNome('Elettricità', vs, TextUtils.cleanLabel).esito, 'una');
  const vs2 = [V(MAPPE + '/4R/Scienze/Elettricità', 'Elettricità', P1)];
  assert.equal(DC.cartellaPerNome('“Elettricità”', vs2, TextUtils.cleanLabel).esito, 'una');
});

test('M3 cartellaPerNome: due omonimi, nessuna, i ripieghi, una senza id → la voce resta', () => {
  const omonimi = [V(MAPPE + '/4R/Scienze/Elettricità', 'Elettricità', P1), V(MAPPE + '/4A/Scienze/Elettricità', 'Elettricità', P2)];
  assert.equal(DC.cartellaPerNome('Elettricità', omonimi, TextUtils.cleanLabel).esito, 'molte');
  assert.equal(DC.cartellaPerNome('Magnetismo', omonimi, TextUtils.cleanLabel).esito, 'nessuna');
  for (const r of ['', 'MappAI', 'Mappa', 'Progetto MappAI', null]) {
    const vs = [V(MAPPE + '/x/' + (r || 'vuota'), r || '', P1)];
    assert.equal(DC.cartellaPerNome(r, vs, TextUtils.cleanLabel).esito, 'ripiego', String(r));
  }
  const senza = [V(MAPPE + '/4R/Scienze/Elettricità', 'Elettricità', null)];
  assert.equal(DC.cartellaPerNome('Elettricità', senza, TextUtils.cleanLabel).esito, 'senza-id');
  const nonValido = [V(MAPPE + '/4R/Scienze/Elettricità', 'Elettricità', 'proj_12')];
  assert.equal(DC.cartellaPerNome('Elettricità', nonValido, TextUtils.cleanLabel).esito, 'senza-id');
});

// ── il piano della migrazione ──────────────────────────────────────────────
test('pianoMigrazione: si spostano le voci col testo e un nome di file; le altre restano, col motivo', () => {
  const voci = [
    voce({ id: 'doc_1', progetto: P1 }),
    voce({ id: 'doc_2' }),                                                        // vecchia: per nome
    voce({ id: 'doc_3', html: '', pdf: PDF }),
    voce({ id: 'doc_4', html: '', pdf: '', rel: 'Documenti/x.html', hasHtml: true, progetto: P1 }), // già spostata
    voce({ id: 'doc_5', pdf: PDF }),                                              // html+pdf
    voce({ id: 'doc_6', progetto: 'tutor_ai_projects' }),                         // M14
    voce({ id: 'doc_7"x' })                                                       // id non da file
  ];
  const p = DC.pianoMigrazione(voci);
  assert.deepEqual(p.daSpostare, ['doc_1', 'doc_2', 'doc_3']);
  const motivi = Object.fromEntries(p.restano.map(r => [r.id, r.motivo]));
  assert.deepEqual(Object.keys(motivi).sort(), ['doc_5', 'doc_6', 'doc_7"x']);
  assert.equal(motivi.doc_6, 'id-non-valido');
});

// ── la regola «non entra» ──────────────────────────────────────────────────
test('M11 esitoNonEntra: si scrive prima il file solo se c\'è dove; altrimenti nulla', () => {
  const si = { acceso: true, scrittore: true, progetto: P1, tipo: 'html' };
  assert.equal(DC.esitoNonEntra(si), 'file-prima');
  assert.equal(DC.esitoNonEntra(Object.assign({}, si, { acceso: false })), 'nulla', 'spento');
  assert.equal(DC.esitoNonEntra(Object.assign({}, si, { scrittore: false })), 'nulla', 'reader');
  assert.equal(DC.esitoNonEntra(Object.assign({}, si, { progetto: '' })), 'nulla', 'senza progetto');
  assert.equal(DC.esitoNonEntra(Object.assign({}, si, { progetto: 'proj_12' })), 'nulla', 'id non valido');
  assert.equal(DC.esitoNonEntra(Object.assign({}, si, { tipo: null })), 'nulla', 'niente da scrivere');
});

// ── secondo giro (05/10) ───────────────────────────────────────────────────
test('punto 3 idDaIndice: il projectId di index.yaml in colonna 0, come main.js:3295-3297', () => {
  assert.equal(DC.idDaIndice('extractionMode: mindmap\nprojectId: ' + P1 + '\nrootNodeLabel: X\n'), P1);
  assert.equal(DC.idDaIndice('projectId: "' + P1 + '"\r\n'), P1, 'virgolette e CRLF');
  assert.equal(DC.idDaIndice("projectId: '" + P1 + "'"), P1);
  assert.equal(DC.idDaIndice('consumi:\n  projectId: ' + P1 + '\n'), '', 'annidato: non è l\'identità');
  assert.equal(DC.idDaIndice('projectId: tutor_ai_projects\n'), '', 'forma non valida');
  assert.equal(DC.idDaIndice('rootNodeLabel: X\n'), '');
  /* due righe `projectId:` in colonna 0: vince l'ULTIMA valida, come il forEach di
     main.js:3294-3297 che sovrascrive (inv. 6: una verità sola) */
  assert.equal(DC.idDaIndice('projectId: ' + P1 + '\nrootNodeLabel: X\nprojectId: ' + P2 + '\n'), P2, 'l\'ultima');
  assert.equal(DC.idDaIndice('projectId: ' + P1 + '\nprojectId: tutor_ai_projects\n'), P1, 'una non valida non cancella quella valida');
  assert.equal(DC.idDaIndice(''), '');
  assert.equal(DC.idDaIndice(null), '');
});

test('S-M9f relValido: solo la forma già normalizzata', () => {
  assert.equal(DC.relValido('Documenti\\x.html'), false);
  assert.equal(DC.relValido('Documenti//x.html'), false);
  assert.equal(DC.relValido('./Documenti/x.html'), false);
});

test('S-M8c voceSnella di una voce già snella tiene hasHtml/hasPdf', () => {
  const s = DC.voceSnella({ id: 'doc_1_1', kind: 'synthesis', title: 'T', hasHtml: true, hasPdf: false }, 'Documenti/T - synthesis - doc_1_1.html');
  assert.equal(s.hasHtml, true);
  const p = DC.voceSnella({ id: 'doc_1_2', kind: 'nodesheet', title: 'T', hasHtml: false, hasPdf: true, testaPdf: 'data:application/pdf;base64' }, 'Documenti/x.pdf');
  assert.equal(p.hasPdf, true);
});

test('S-X26 nomeFile: un id che comincia col punto → null', () => {
  assert.equal(DC.nomeFile({ id: '.doc_1', kind: 'synthesis', title: 'T', html: 'a' }), null);
});

// ── 0082 (B3 (a), ADR 0018 rev. 1 C3): l'uscita oltre il tetto ──────────────────
/* `voci` dalla più nuova (indice 0) alla più vecchia, come l'archivio. Esce prima la
   voce SENZA testo più vecchia (il suo file è nella cartella); una voce col testo
   (html o pdf: l'unica copia) non esce mai; se resta oltre il tetto, `oltre: true`. */
const snella = (id) => ({ id, title: id, kind: 'quiz', rel: 'Documenti/' + id + '.html' });
const piena = (id) => ({ id, title: id, kind: 'quiz', html: '<p>' + id + '</p>' });
const pdf = (id) => ({ id, title: id, kind: 'quiz', pdf: 'JVBERi0' });

test('0082 oltreIlTetto: entro il tetto niente esce', () => {
  const voci = [piena('a'), snella('b')];
  const r = DC.oltreIlTetto(voci, 3);
  assert.deepEqual(r.voci.map(v => v.id), ['a', 'b']);
  assert.deepEqual(r.via, []);
  assert.equal(r.oltre, false);
});

test('0082 M11 oltreIlTetto: esce prima la snella più vecchia, mai una col testo', () => {
  const voci = [piena('n1'), snella('s1'), piena('n2'), snella('s2'), piena('vecchia')];
  const r = DC.oltreIlTetto(voci, 4);
  assert.deepEqual(r.via.map(v => v.id), ['s2'], 'la snella più vecchia');
  assert.deepEqual(r.voci.map(v => v.id), ['n1', 's1', 'n2', 'vecchia'], 'l\'ordine resta');
  assert.equal(r.oltre, false);
});

test('0082 oltreIlTetto: tutte col testo → nessuna esce e oltre: true', () => {
  const voci = [piena('a'), pdf('b'), piena('c')];
  const r = DC.oltreIlTetto(voci, 2);
  assert.deepEqual(r.via, []);
  assert.deepEqual(r.voci.map(v => v.id), ['a', 'b', 'c']);
  assert.equal(r.oltre, true);
});

test('0082 oltreIlTetto: escono solo le snelle che servono, e se non bastano oltre: true', () => {
  const voci = [snella('s1'), piena('a'), snella('s2'), piena('b'), snella('s3')];
  const r = DC.oltreIlTetto(voci, 2);
  assert.deepEqual(r.via.map(v => v.id), ['s3', 's2', 's1']);
  assert.deepEqual(r.voci.map(v => v.id), ['a', 'b']);
  assert.equal(r.oltre, false);
  const r2 = DC.oltreIlTetto([piena('a'), snella('s'), piena('b'), piena('c')], 2);
  assert.deepEqual(r2.via.map(v => v.id), ['s']);
  assert.equal(r2.oltre, true);
});

test('0082 oltreIlTetto: non tocca l\'elenco ricevuto; ingressi strani non lanciano', () => {
  const voci = [snella('a'), snella('b')];
  DC.oltreIlTetto(voci, 1);
  assert.equal(voci.length, 2);
  assert.doesNotThrow(() => DC.oltreIlTetto(null, 30));
  assert.deepEqual(DC.oltreIlTetto(null, 30), { voci: [], via: [], oltre: false });
});
