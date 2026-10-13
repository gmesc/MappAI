/*
 * mappai-import-vault-core.js — logica PURA dell'importazione di un vault (0095, ADR 0021)
 * -----------------------------------------------------------------------
 * «Importa dal Vault» non apre più la cartella dov'è: la COPIA in
 * `MappAI - file/Mappe/<classe>/<materia>/<nome>` e apre la copia. Qui si decide
 * tutto quello che non è I/O (inv. 4 e 19): main.js copia e scrive, la UI chiede.
 *
 *  - pianoImport          → dove va il vault, col nome libero, l'id e che cosa manca al docente
 *  - destinazioneScelta   → la stessa destinazione per una classe e una materia scelte dal docente
 *  - idDellaCopia         → l'id che la copia porta in `index.yaml` (ADR 0013, D5)
 *  - indiceConId          → il testo di `index.yaml` con `projectId` in testa, il resto identico
 *  - vecchiDelManifesto   → i percorsi vecchi del vault (D6); la riscrittura è
 *                           `MappAINomeCartellaCore.riparaPercorsi` dello 0094
 *
 * Nomi e cartelle vengono da FilesCore (inv. 6), risolto al momento della
 * chiamata: in Node con `require`, nel browser da `window`. Il nome libero col
 * suffisso « · 0N» lo dà il chiamante (`nomeLibero`), perché la regola vive già
 * altrove (`MappAINomeCartellaCore.nomeLibero` dello 0094).
 *
 * UMD: module.exports per Node, window.MappAIImportVaultCore per il browser.
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
  /* Due nomi sono lo stesso nome se differiscono solo per maiuscole o forma
     Unicode (trappole 25 e 50): dal disco arrivano scomposti, dalla memoria composti. */
  function _chiave(x) {
    var v = _s(x).trim();
    try { v = v.normalize('NFC'); } catch (e) { /* motore senza normalize */ }
    return v.toLowerCase();
  }
  function _nfc(x) { var v = _s(x); try { return v.normalize('NFC'); } catch (e) { return v; } }

  /* ── L'id della copia (ADR 0013; D5 del packet) ──────────────────────────
     Una copia tiene l'id della sorgente solo se nessun altro progetto ce l'ha:
     né una cartella di Mappe/ (`getAllVaults`, campo `projectId`) né una voce
     del cassetto (`tutor_ai_projects`, campo `id`). Altrimenti, e quando la
     sorgente non ne ha uno valido (beta 1-5), ne riceve uno nuovo nella forma
     che l'app conia, mai uguale a uno già in uso. */
  function idDellaCopia(idSorgente, cartelle, voci, ora) {
    var F = _fc();
    var occupati = {};
    (Array.isArray(cartelle) ? cartelle : []).forEach(function (c) { if (c && F.idProgettoValido(c.projectId)) occupati[c.projectId] = true; });
    (Array.isArray(voci) ? voci : []).forEach(function (v) { if (v && F.idProgettoValido(v.id)) occupati[v.id] = true; });
    var nuovo = function () {
      var t = Number(typeof ora === 'function' ? ora() : Date.now());
      if (!(t > 0)) t = Date.now();
      while (occupati['proj_' + t]) t++;
      return 'proj_' + t;
    };
    if (!F.idProgettoValido(idSorgente)) return { valore: nuovo(), tenuto: false, motivo: 'assente' };
    if (occupati[idSorgente]) return { valore: nuovo(), tenuto: false, motivo: 'occupato' };
    return { valore: idSorgente, tenuto: true, motivo: 'tenuto' };
  }

  /* La classe del docente con quel nome (D1: una classe che non ha resta solo
     una cartella). Il confronto è quello della sidebar: maiuscole e forma
     Unicode non contano. */
  function _classeDelDocente(classi, nome) {
    var k = _chiave(nome);
    if (!k) return null;
    return (Array.isArray(classi) ? classi : []).filter(function (c) { return c && _chiave(c.name) === k; })[0] || null;
  }
  function _materiaDelDocente(materie, nome) {
    var k = _chiave(nome);
    if (!k) return null;
    return (Array.isArray(materie) ? materie : []).filter(function (m) { return _chiave(m) === k; })[0] || null;
  }

  /* Dove va il vault, dati il nome della classe (con la sua sede, se è del
     docente) e della materia. Senza classe: Mappe/Generico/<nome>, e la materia
     non fa cartella (sotto Generico il livello materia non c'è). Il nome è
     quello della cartella importata, reso libero contro i fratelli della
     STESSA destinazione (come `_resolveFolderPath` della pipeline). */
  function _destinazione(classeNome, sede, materiaNome, nomeBase, cartelle, nomeLibero) {
    var F = _fc();
    var classDir = _s(classeNome).trim() ? F.mapClassFolder(sede || '', classeNome) : null;
    var discDir = classDir ? F.disciplineFolder(materiaNome) : '';
    var segmenti = F.mapVaultParents(classDir, discDir);
    /* `_chiave` anche qui: sul disco del Mac «4r» e «4R» sono la stessa cartella */
    var fratelli = (Array.isArray(cartelle) ? cartelle : []).filter(function (v) {
      return v && _chiave(v.classDir || '') === _chiave(classDir || '') && _chiave(v.discDir || '') === _chiave(discDir || '');
    }).map(function (v) { return v.folderName; });
    var base = F.vaultFolderName(nomeBase);
    if (typeof nomeLibero !== 'function') throw new Error('nomeLibero mancante');
    var lib = nomeLibero(base, fratelli) || {};
    var nome = _s(lib.nome) || base;
    return { classDir: classDir, discDir: discDir || '', segmenti: segmenti.concat([nome]), nome: nome, suffisso: !!lib.suffisso && nome !== base };
  }

  /* ── Il piano dell'import ────────────────────────────────────────────────
     q = { indice: { projectId, classe, materia, rootNodeLabel }, nomeOrigine,
           cartelle (getAllVaults), voci (tutor_ai_projects),
           classi (MappAIClasses.list(): { name, sede }), materieMie (profilo + classi),
           nomeLibero(nome, fratelli) → { nome, suffisso }, ora }
     La destinazione proposta è quella che il vault dichiara: la classe e la
     materia di chi l'ha fatto, con le cartelle che mancano (scelta «c» e D1).
     `mancano` dice al modale che cosa il docente non ha: 'materia' si offre di
     aggiungerla al profilo, 'classe' crea solo la cartella. */
  function pianoImport(q) {
    q = q || {};
    var ind = q.indice || {};
    var classeNome = _s(ind.classe).trim();
    var materiaNome = _s(ind.materia).trim();
    var cls = _classeDelDocente(q.classi, classeNome);
    var mat = _materiaDelDocente(q.materieMie, materiaNome);
    var mancano = [];
    if (classeNome && !cls) mancano.push('classe');
    if (materiaNome && !mat) mancano.push('materia');
    var nomeBase = _s(q.nomeOrigine).trim() || _s(ind.rootNodeLabel).trim();
    return {
      titolo: _s(ind.rootNodeLabel).trim() || nomeBase,
      nomeOrigine: nomeBase,
      /* il nome scritto dal docente vince sulla grafia del vault («4r» → «4R») */
      classe: { nome: cls ? cls.name : classeNome, mia: !!cls, sede: cls ? (cls.sede || '') : '' },
      materia: { nome: mat || materiaNome, mia: !!mat },
      mancano: mancano,
      destinazione: _destinazione(cls ? cls.name : classeNome, cls ? cls.sede : '', mat || materiaNome, nomeBase, q.cartelle, q.nomeLibero),
      id: idDellaCopia(ind.projectId, q.cartelle, q.voci, q.ora)
    };
  }

  /* La destinazione per la scelta «Mettila in una mia classe e materia».
     `scelta.classe` vuota = Generico. La classe deve essere del docente: una
     classe sconosciuta qui è un errore del chiamante, non una cartella nuova. */
  function destinazioneScelta(piano, scelta, q) {
    q = q || {};
    scelta = scelta || {};
    var cls = _classeDelDocente(q.classi, scelta.classe);
    if (_s(scelta.classe).trim() && !cls) throw new Error('classe non del docente: ' + scelta.classe);
    return _destinazione(cls ? cls.name : '', cls ? cls.sede : '', cls ? _s(scelta.materia).trim() : '',
      (piano && piano.nomeOrigine) || '', q.cartelle, q.nomeLibero);
  }

  /* ── `index.yaml` della copia: solo l'id ────────────────────────────────
     D2 di Giacomo: la copia conserva classe e materia di chi l'ha fatta; si
     scrive solo `projectId`, in testa e in colonna 0 come dal packet 0061. Il
     resto resta IDENTICO riga per riga: un `index.yaml` vecchio che `yaml.load`
     non legge si legge ancora riga per riga (fallback di load-vault), e una
     riserializzazione lo romperebbe. Si tolgono solo le righe `projectId:` in
     colonna 0 (quelle annidate nei consumi non sono l'identità). */
  function indiceConId(testo, id) {
    if (!_fc().idProgettoValido(id)) throw new Error('id non valido: ' + id);
    var t = _s(testo);
    var bom = t.charCodeAt(0) === 0xFEFF ? '﻿' : '';
    if (bom) t = t.slice(1);
    var eol = t.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    var righe = t.length ? t.split(/\r?\n/) : [];
    righe = righe.filter(function (r) { return !/^projectId\s*:/.test(r); });
    var riga = 'projectId: ' + id;
    var at = (righe.length && /^---\s*$/.test(righe[0])) ? 1 : 0;
    righe.splice(at, 0, riga);
    var out = righe.join(eol);
    if (!/\r?\n$/.test(out)) out += eol;
    return bom + out;
  }

  /* ── I percorsi di `pipeline.json` nella copia (D6) ──────────────────────
     Un `vaultPath` è il posto dove il vault stava quando è stato scritto. I
     percorsi VECCHI sono due: la cartella sorgente e il `vaultPath` in cima al
     manifesto. Misurato su 78 manifesti veri (13/10): ogni `vaultPath` non vuoto
     è uguale a quello in cima, e nei vault d'archivio quello in cima è ancora il
     vecchio indirizzo in Mappe/, diverso dalla cartella vera. */
  function _forma(p) { return _nfc(p).replace(/[\\/]+$/, ''); }
  function vecchiDelManifesto(manifesto, sorgente) {
    var out = [], visti = {};
    [sorgente, manifesto && manifesto.vaultPath].forEach(function (p) {
      var f = _forma(p);
      if (!f || visti[f]) return;
      visti[f] = true; out.push(f);
    });
    return out;
  }

  /* ── L'id vecchio dentro i file della copia (D10, gate del 13/10) ─────────
     L'id del progetto non vive solo in `index.yaml`: `pipeline.json` lo ripete
     (`reading.projectId`, `review.projectId`, i consumi) e i documenti del
     percorso di lettura lo portano dentro. All'apertura la lettura
     (`openVault`) e la revisione (`assertCurrent`) controllano che siano tutti
     uguali: una copia con l'id nuovo solo in `index.yaml` si fermava con «Il
     progetto è cambiato». Gli id vecchi sono quelli che il VAULT dichiara per
     sé: `index.yaml` della sorgente e i due del manifesto. */
  function idVecchiDelVault(idIndice, manifesto, nuovo) {
    var F = _fc(), out = [];
    var m = manifesto || {};
    [idIndice, m.reading && m.reading.projectId, m.review && m.review.projectId].forEach(function (id) {
      if (F.idProgettoValido(id) && id !== nuovo && out.indexOf(id) < 0) out.push(id);
    });
    return out;
  }
  /* Sostituisce nel testo SOLO i token interi `proj_<cifre>` uguali a un id
     vecchio: `proj_17914476098031` non è `proj_1791447609803`. */
  function sostituisciId(testo, vecchi, nuovo) {
    var s = _s(testo), cambi = 0;
    var vv = (Array.isArray(vecchi) ? vecchi : []).filter(function (x) { return x && x !== nuovo; });
    if (!vv.length || !_fc().idProgettoValido(nuovo)) return { testo: s, cambi: 0 };
    var out = s.replace(/proj_\d+/g, function (tok, at) {
      if (at > 0 && /[A-Za-z0-9_]/.test(s.charAt(at - 1))) return tok;
      if (vv.indexOf(tok) < 0) return tok;
      cambi++;
      return nuovo;
    });
    return { testo: out, cambi: cambi };
  }

  var CORE = {
    idVecchiDelVault: idVecchiDelVault,
    sostituisciId: sostituisciId,
    pianoImport: pianoImport,
    destinazioneScelta: destinazioneScelta,
    idDellaCopia: idDellaCopia,
    indiceConId: indiceConId,
    vecchiDelManifesto: vecchiDelManifesto
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window === 'undefined') return;
  window.MappAIImportVaultCore = CORE;
})();
