/*
 * mappai-riassegna-copia-core.js — le regole di «Riassegna…» e «Copia…» (packet 0124, ADR 0025)
 * -----------------------------------------------------------------------
 * Nel menu della briciola del progetto (ELABORA e INSEGNA), sotto «Rinomina…».
 * Giacomo, 23/10: «'Riassegna' apre un modale in cui selezionare le classi, gli
 * allievi e le materie esistenti nel profilo dell'insegnante, il sottotitolo del
 * modale dice 'Cambia cartella del progetto'»; «'Copia' […] 'Copia tutto il
 * progetto nella cartella di un altra destinazione'»; «I modali devono obbligare a
 * scegliere una classe o un allievo e poi una materia, altrimenti bloccano
 * l'operazione.» 24/10: niente «Generico»; le materie nuove nascono in Cabina.
 *
 * Qui le scelte, pure (inv. 4): che cosa si offre, dove va la cartella, quando il
 * bottone resta spento, la riga del cassetto e `index.yaml` dopo il gesto. Lo
 * spostamento e la copia li fa main.js (`vault-relocate`, `vault-copy`, inv. 19);
 * il modale lo monta `mappai-riassegna-copia.js`. Nomi e cartelle vengono da
 * FilesCore (inv. 6), risolto al momento della chiamata come nel core dell'import.
 *
 * UMD: module.exports per Node, window.MappAIRiassegnaCopiaCore per il browser.
 */
(function () {
  'use strict';

  function _fc() {
    var F = null;
    try {
      if (typeof module !== 'undefined' && module.exports && typeof require === 'function') F = require('./mappai-files-core.js');
    } catch (e) { F = null; }
    if (!F && typeof window !== 'undefined') F = window.MappAIFilesCore || null;
    if (!F) throw new Error('MappAIFilesCore mancante');
    return F;
  }

  function _s(x) { return String(x == null ? '' : x); }
  /* maiuscole e forma Unicode non contano (trappole 25 e 50) */
  function _chiave(x) {
    var v = _s(x).trim();
    try { v = v.normalize('NFC'); } catch (e) { /* motore senza normalize */ }
    return v.toLowerCase();
  }

  /* Il primo campo: le classi, poi gli allievi, nell'ordine in cui arrivano (chi
     chiama li ordina con `MappAIConsoleBento.ordinaElenco`, una regola sola). Il
     valore porta il tipo: «c:<id>» per una classe, «a:<nome>» per un allievo. */
  function scelteChi(classi, allievi) {
    var out = [];
    (Array.isArray(classi) ? classi : []).forEach(function (c) {
      if (!c || !_s(c.name).trim()) return;
      out.push({ tipo: 'classe', valore: 'c:' + _s(c.id), id: _s(c.id), nome: _s(c.name), sede: _s(c.sede), etichetta: _s(c.name) });
    });
    (Array.isArray(allievi) ? allievi : []).forEach(function (p) {
      var n = p && _s(p.nickname).trim();
      if (!n) return;
      out.push({ tipo: 'allievo', valore: 'a:' + n, nome: n, etichetta: n });
    });
    return out;
  }
  function sceltaDa(valore, scelte) {
    var v = _s(valore);
    if (!v) return null;
    return (Array.isArray(scelte) ? scelte : []).filter(function (s) { return s.valore === v; })[0] || null;
  }

  /* Dove va: una classe in `Classi/<sede-classe>/<materia>`, un allievo in
     `Allievi/<allievo>/<materia>` (la forma che get-all-vaults legge già).
     Senza scelta o senza materia: nessuna destinazione. */
  function destinazione(scelta, materia) {
    var F = _fc(), m = _s(materia).trim();
    if (!scelta || !m) return null;
    var disc = F.disciplineFolder(m);
    if (!disc) return null;
    if (scelta.tipo === 'allievo') {
      var a = F.safeName(scelta.nome, '');
      if (!a) return null;
      return { base: 'students', parti: [a, disc], classeNome: '', classDir: null, allievo: scelta.nome, materia: m, discDir: disc };
    }
    var classDir = F.mapClassFolder(scelta.sede || '', scelta.nome);
    return { base: 'maps', parti: F.mapVaultParents(classDir, m), classeNome: scelta.nome, classDir: classDir, allievo: '', materia: m, discDir: disc };
  }

  /* Dove sta oggi: la cartella madre del progetto, relativa alla base che la
     contiene. `basi` = { maps, students } (files-root-get). Fuori: null. */
  function _segmenti(p) { return _s(p).split(/[\\/]+/).filter(Boolean); }
  function posizioneDi(vaultPath, basi) {
    var segs = _segmenti(vaultPath);
    var prova = [['maps', basi && basi.maps], ['students', basi && basi.students]];
    for (var i = 0; i < prova.length; i++) {
      var b = _segmenti(prova[i][1]);
      if (!b.length || segs.length <= b.length) continue;
      var dentro = b.every(function (x, j) { return _chiave(x) === _chiave(segs[j]); });
      if (dentro) return { base: prova[i][0], parti: segs.slice(b.length, segs.length - 1) };
    }
    return null;
  }
  function _stessoPosto(a, b) {
    if (!a || !b || a.base !== b.base || a.parti.length !== b.parti.length) return false;
    return a.parti.every(function (x, i) { return _chiave(x) === _chiave(b.parti[i]); });
  }

  /* Il bottone del modale: spento finché manca qualcosa, col motivo. */
  function valida(scelta, materia, attuale) {
    if (!scelta) return { ok: false, motivo: 'Scegli una classe o un allievo.' };
    var dest = destinazione(scelta, materia);
    if (!dest) return { ok: false, motivo: 'Scegli la materia.' };
    if (_stessoPosto(dest, attuale)) return { ok: false, motivo: 'Il progetto è già qui.' };
    return { ok: true, motivo: '' };
  }

  /* La riga del cassetto (`tutor_ai_projects`) dopo «Riassegna»: gli stessi campi
     che scriveva il modale «Assegna classe e disciplina» (`writeMeta`). Il nome
     e la cartella li ripara `MappAIRinomina.riparaRiferimenti`. */
  function rigaRiassegnata(riga, dest, scelta) {
    var r = Object.assign({}, riga || {});
    var classe = dest && dest.base === 'maps' && scelta && scelta.tipo === 'classe';
    r.cls = classe ? scelta.nome : null;
    r.clsId = classe ? (scelta.id || null) : null;
    r.classDir = classe ? dest.classDir : null;
    r.disc = dest ? dest.materia : null;
    r.discDir = dest ? dest.discDir : null;
    return r;
  }

  /* `index.yaml` dice di che cosa parla la mappa (9/8): dopo «Riassegna» e nella
     copia di «Copia», classe e materia sono quelle della destinazione. Si toccano
     solo le righe `classe:` e `materia:` in colonna 0 (le annidate restano); se
     mancano vanno in fondo. Un valore che lo YAML leggerebbe male va fra virgolette. */
  function _scalare(v) {
    var s = _s(v);
    return /^[A-Za-z0-9À-ÖØ-öø-ÿ][A-Za-z0-9À-ÖØ-öø-ÿ .·'_-]*$/.test(s) && s.trim() === s ? s : JSON.stringify(s);
  }
  function indiceConContesto(testo, ctx) {
    var t = _s(testo);
    var bom = t.charCodeAt(0) === 0xFEFF ? '﻿' : '';
    if (bom) t = t.slice(1);
    var eol = t.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    var righe = t.length ? t.split(/\r?\n/) : [];
    if (righe.length && righe[righe.length - 1] === '') righe.pop();
    ['classe', 'materia'].forEach(function (k) {
      var riga = k + ': ' + _scalare(ctx && ctx[k]);
      var i = righe.findIndex(function (r) { return new RegExp('^' + k + '\\s*:').test(r); });
      if (i >= 0) righe[i] = riga; else righe.push(riga);
    });
    /* La scheda dell'allievo (Giacomo, 24/10: «verso un allievo, index.yaml prende la scheda
       di quell'allievo; verso una classe la scheda si svuota»): aprire una mappa rimette il
       suo `userProfile` come allievo attivo, quindi la scheda deve dire dove sta. Il blocco
       `userProfile:` in colonna 0 (con le sue righe rientrate) diventa una riga sola, una
       mappa JSON, che lo YAML legge uguale. Senza la chiave nel contesto non si tocca. */
    if (ctx && ctx.userProfile && typeof ctx.userProfile === 'object') {
      var scheda = 'userProfile: ' + JSON.stringify(ctx.userProfile);
      var u = righe.findIndex(function (r) { return /^userProfile\s*:/.test(r); });
      if (u < 0) righe.push(scheda);
      else {
        var fine = u + 1;
        while (fine < righe.length && /^\s+\S/.test(righe[fine])) fine++;
        righe.splice(u, fine - u, scheda);
      }
    }
    return bom + righe.join(eol) + eol;
  }

  /* I pezzi del percorso che arrivano dal renderer: ognuno un nome di cartella che
     FilesCore lascerebbe com'è, mai `.`/`..`, mai una barra. */
  function partiSicure(parti) {
    var F = _fc();
    if (!Array.isArray(parti) || !parti.length) return null;
    for (var i = 0; i < parti.length; i++) {
      var p = parti[i];
      if (typeof p !== 'string' || !p || p === '.' || p === '..' || F.safeName(p, '') !== p) return null;
    }
    return parti.slice();
  }

  /* «Classi › 4R › Storia › IL SALE»: le parole delle cartelle, per «Ora» e «Andrà in». */
  function dove(pos, nome, nomiBasi) {
    if (!pos) return '';
    var b = (nomiBasi && nomiBasi[pos.base]) || (pos.base === 'students' ? 'Allievi' : 'Classi');
    return [b].concat(pos.parti || [], nome ? [nome] : []).join(' › ');
  }

  var CORE = {
    scelteChi: scelteChi,
    sceltaDa: sceltaDa,
    destinazione: destinazione,
    posizioneDi: posizioneDi,
    valida: valida,
    rigaRiassegnata: rigaRiassegnata,
    indiceConContesto: indiceConContesto,
    partiSicure: partiSicure,
    dove: dove
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAIRiassegnaCopiaCore = CORE;
})();
