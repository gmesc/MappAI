/*
 * mappai-documenti-core.js — i documenti salvati come file della cartella della
 * mappa (packet 0077, ADR 0018 punto 1 e scelta 3 (a)). Core PURO, UMD (inv. 4):
 * niente DOM, niente disco, niente localStorage. Lo monta `MappAIStudyDocs`
 * (mappai-study-export-core.js), che fa l'I/O.
 *
 * Che cosa decide:
 *  - il NOME del file di un documento: `Documenti/<titolo> - <tipo> - <id>.html|.pdf`.
 *    L'id lo rende unico e stabile: rigenerare lo stesso documento (stessa chiave
 *    kind|title|mapName, quindi stesso id) riscrive lo stesso file;
 *  - la CARTELLA di un documento: la sola, fra quelle che `getAllVaults()` elenca,
 *    che porta il suo `projectId` (P1, ADR 0013). Per le voci vecchie senza id, una
 *    sola ricerca per NOME (NFC e forma `cleanLabel`, trappola 25): una cartella
 *    sola e con un id valido, altrimenti niente;
 *  - la VOCE SNELLA (l'elenco, senza il testo) e la voce INTERA ricostruita dal file,
 *    identica a quella di prima;
 *  - quando una RILETTURA è uguale a ciò che si è scritto;
 *  - il PIANO della migrazione e la regola «non entra».
 *
 * Nel reader questo file NON c'è (e non va aggiunto): senza di lui l'archivio fa
 * esattamente quello che faceva prima.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.MappAIDocumentiCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var CARTELLA = 'Documenti';
  /* i ripieghi con cui i moduli chiamano una mappa senza nome: per nome non
     portano a nessuna cartella (sarebbero «tutte») */
  var RIPIEGHI = ['', 'mappai', 'mappa', 'progetto mappai'];
  var MAX_TITOLO = 100;

  /* `mappai-files-core.js` (safeName, idProgettoValido: una fonte sola, inv. 6).
     In index.html carica DOPO l'archivio: si risolve al momento dell'uso. */
  var _fc = null;
  function FC() {
    if (_fc) return _fc;
    try { if (typeof require === 'function') _fc = require('./mappai-files-core.js'); } catch (e) { _fc = null; }
    if (!_fc && root && root.MappAIFilesCore) _fc = root.MappAIFilesCore;
    return _fc;
  }
  function idValido(x) { var f = FC(); return !!(f && f.idProgettoValido && f.idProgettoValido(x)); }
  function safeName(s, fb) { var f = FC(); return f && f.safeName ? f.safeName(s, fb) : ''; }

  function nfc(s) {
    var str = String(s == null ? '' : s);
    try { return str.normalize('NFC'); } catch (e) { return str; }
  }

  /* L'id di progetto che una voce può portare: solo la forma che l'app conia
     (M14). Qualunque altro valore vale come assente. */
  function progetto(x) { return idValido(x) ? x : ''; }

  var RE_PDF = /^(data:[^,]*;base64),([A-Za-z0-9+/=\s]*)$/;
  function testaPdf(pdf) { var m = RE_PDF.exec(String(pdf || '')); return m ? m[1] : null; }
  function corpoPdf(pdf) { var m = RE_PDF.exec(String(pdf || '')); return m ? m[2] : null; }

  /* Che cosa si scrive in un file solo: l'HTML, oppure il PDF in data-URI base64.
     Una voce che li ha tutti e due, o un PDF che non è base64, resta nel cassetto. */
  function tipo(voce) {
    var v = voce || {};
    var h = typeof v.html === 'string' && v.html.length > 0;
    var p = typeof v.pdf === 'string' && v.pdf.length > 0;
    if (h && !p) return 'html';
    if (p && !h) return corpoPdf(v.pdf) != null ? 'pdf' : null;
    return null;
  }

  function nomeFile(voce) {
    var v = voce || {};
    var t = tipo(v);
    if (!t) return null;
    var id = String(v.id == null ? '' : v.id);
    if (!id || safeName(id, '') !== id || id.charAt(0) === '.') return null;
    var kind = String(v.kind || 'documento');
    if (safeName(kind, '') !== kind) return null;
    var titolo = safeName(nfc(v.title).slice(0, MAX_TITOLO), '').replace(/^\.+/, '');
    titolo = safeName(titolo, 'Documento');
    var nome = titolo + ' - ' + kind + ' - ' + id + '.' + t;
    var rel = CARTELLA + '/' + nome;
    return relValido(rel) ? rel : null;
  }

  /* M9: due segmenti, il primo è `Documenti`, e il nome supera la stessa guardia
     dell'IPC (`sanitizeVaultRelPath`). Niente assoluti, niente `..`. */
  function relValido(rel) {
    if (typeof rel !== 'string' || !rel) return false;
    var f = FC();
    if (!f || !f.sanitizeVaultRelPath) return false;
    if (rel.charAt(0) === '/' || /^[a-zA-Z]:/.test(rel) || rel.indexOf('\\') >= 0) return false;
    var s = f.sanitizeVaultRelPath(rel);
    if (s !== rel) return false;
    var segs = s.split('/');
    return segs.length === 2 && segs[0] === CARTELLA && segs[1].charAt(0) !== '.';
  }

  /* La voce nel cassetto: l'elenco, senza il testo (4.1). `testaPdf` tiene il
     prefisso esatto del data-URI (jsPDF scrive `;filename=generated.pdf`), così
     il PDF ricostruito è IDENTICO a quello salvato. */
  function voceSnella(voce, rel) {
    var v = voce || {};
    var out = {
      id: v.id, kind: v.kind, title: v.title, mapName: v.mapName, cls: v.cls, disc: v.disc,
      date: v.date, overLimit: v.overLimit || 0,
      hasHtml: !!(v.html || v.hasHtml), hasPdf: !!(v.pdf || v.hasPdf)
    };
    var p = progetto(v.progetto);
    if (p) out.progetto = p;
    if (rel) out.rel = rel;
    var tp = v.pdf ? testaPdf(v.pdf) : (v.testaPdf || null);
    if (tp && out.hasPdf) out.testaPdf = tp;
    return out;
  }

  /* La voce intera, come la restituiva `get` prima: i campi di oggi, col testo
     al suo posto. `contenuto` = l'HTML (testo) o il corpo base64 del PDF. */
  function pienaDaFile(snella, contenuto) {
    var s = snella || {};
    var isPdf = !!s.hasPdf && !s.hasHtml;
    var out = {
      id: s.id, kind: s.kind, title: s.title, mapName: s.mapName, cls: s.cls, disc: s.disc,
      date: s.date,
      html: isPdf ? '' : String(contenuto == null ? '' : contenuto),
      overLimit: s.overLimit || 0,
      pdf: isPdf ? ((s.testaPdf || 'data:application/pdf;base64') + ',' + String(contenuto == null ? '' : contenuto)) : ''
    };
    if (s.progetto) out.progetto = s.progetto;
    return out;
  }

  /* M1: il file riletto (sempre base64, read-vault-file) è ciò che si è scritto?
     HTML: decodificato in UTF-8 e confrontato carattere per carattere.
     PDF: il corpo base64, confrontato tale e quale. */
  function rilettaUguale(voce, base64Riletto, decodificaUtf8) {
    if (typeof base64Riletto !== 'string' || !base64Riletto) return false;
    var t = tipo(voce);
    if (t === 'pdf') return String(corpoPdf(voce.pdf)).replace(/\s+/g, '') === base64Riletto;
    if (t === 'html') {
      var testo;
      try { testo = decodificaUtf8(base64Riletto); } catch (e) { return false; }
      return testo === voce.html;
    }
    return false;
  }

  /* P1: la cartella di un documento è la SOLA che porta il suo id. */
  function cartellaPerId(id, vaults) {
    if (!idValido(id)) return { esito: 'id-non-valido', n: 0 };
    var trovate = (vaults || []).filter(function (v) { return v && v.projectId === id && v.fullPath; });
    if (trovate.length === 1) return { esito: 'una', n: 1, vault: trovate[0] };
    return { esito: trovate.length ? 'molte' : 'nessuna', n: trovate.length };
  }

  /* L'id che la cartella dichiara DAVVERO, letto dal suo `index.yaml`: la riga
     `projectId:` in colonna 0, come la legge main.js (:3295-3297); le chiavi
     annidate non sono l'identità. Serve a non scrivere con un elenco vecchio.
     Con più righe vince l'ULTIMA valida, come il forEach di main.js che
     sovrascrive (inv. 6: una verità sola); una riga non valida non cancella. */
  function idDaIndice(testo) {
    var righe = String(testo == null ? '' : testo).split('\n');
    var trovato = '';
    for (var i = 0; i < righe.length; i++) {
      var l = righe[i].replace(/\r$/, '');
      if (l.indexOf('projectId:') === 0) {
        var pid = l.substring(l.indexOf(':') + 1).trim().replace(/^["']|["']$/g, '');
        if (idValido(pid)) trovato = pid;
      }
    }
    return trovato;
  }

  /* Le voci vecchie, senza progetto: una ricerca per nome, una volta sola.
     `pulisci` = cleanLabel (iniettato: il core non tocca window). */
  function _forme(s, pulisci) {
    var out = [];
    var a = nfc(s).trim();
    if (a) out.push(a);
    if (typeof pulisci === 'function') {
      var b = '';
      try { b = nfc(pulisci(String(s == null ? '' : s))).trim(); } catch (e) { b = ''; }
      if (b && out.indexOf(b) < 0) out.push(b);
    }
    return out;
  }
  function cartellaPerNome(mapName, vaults, pulisci) {
    var forme = _forme(mapName, pulisci);
    var ripiego = !forme.length || forme.some(function (f) { return RIPIEGHI.indexOf(f.toLowerCase()) >= 0; });
    if (ripiego) return { esito: 'ripiego', n: 0 };
    var trovate = (vaults || []).filter(function (v) {
      if (!v || !v.fullPath) return false;
      var fv = _forme(v.rootNodeLabel, pulisci);
      return fv.some(function (x) { return forme.indexOf(x) >= 0; });
    });
    if (trovate.length > 1) return { esito: 'molte', n: trovate.length };
    if (!trovate.length) return { esito: 'nessuna', n: 0 };
    if (!idValido(trovate[0].projectId)) return { esito: 'senza-id', n: 1 };
    return { esito: 'una', n: 1, vault: trovate[0], progetto: trovate[0].projectId };
  }

  /* Che cosa migrare: le voci che hanno ancora il testo nel cassetto e un nome
     di file possibile. Le altre restano, col motivo. */
  function pianoMigrazione(voci) {
    var daSpostare = [], restano = [];
    (voci || []).forEach(function (v) {
      if (!v || !(v.html || v.pdf)) return;
      if (v.progetto != null && v.progetto !== '' && !idValido(v.progetto)) { restano.push({ id: v.id, motivo: 'id-non-valido' }); return; }
      if (!tipo(v)) { restano.push({ id: v.id, motivo: 'contenuto' }); return; }
      if (!nomeFile(v)) { restano.push({ id: v.id, motivo: 'nome' }); return; }
      daSpostare.push(v.id);
    });
    return { daSpostare: daSpostare, restano: restano };
  }

  /* 0082 (B3 (a); ADR 0018 rev. 1, C3): chi esce dall'elenco oltre il tetto.
     Prima usciva la voce più vecchia, anche quando portava il testo: l'unica copia
     del documento, senza file nella cartella. Ora escono prima le voci SENZA testo
     (snelle: il loro file sta nella cartella e niente si perde), dalla più vecchia;
     una voce col testo (html o pdf) non esce mai. Se anche così restano più voci del
     tetto, l'elenco lo passa e `oltre` lo dice (chi chiama avvisa). `voci` va dalla
     più nuova (indice 0) alla più vecchia, come l'archivio; l'ordine resta, e
     l'elenco ricevuto non si tocca. → { voci, via, oltre } */
  function oltreIlTetto(voci, tetto) {
    if (!Array.isArray(voci)) return { voci: [], via: [], oltre: false };
    var t = (typeof tetto === 'number' && isFinite(tetto) && tetto >= 0) ? Math.floor(tetto) : Infinity;
    var out = voci.slice(), via = [];
    for (var i = out.length - 1; i >= 0 && out.length > t; i--) {
      var v = out[i];
      if (v && (v.html || v.pdf)) continue;
      via.push(v);
      out.splice(i, 1);
    }
    return { voci: out, via: via, oltre: out.length > t };
  }

  /* La regola «non entra» (4.2 punto 4): se il testo non entra nel cassetto, si
     scrive PRIMA il file solo quando c'è dove scriverlo; altrimenti `save` non
     ha salvato niente e lo dice. */
  function esitoNonEntra(o) {
    o = o || {};
    if (!o.acceso || !o.scrittore || !idValido(o.progetto) || !o.tipo) return 'nulla';
    return 'file-prima';
  }

  return {
    CARTELLA: CARTELLA,
    nfc: nfc,
    progetto: progetto,
    tipo: tipo,
    testaPdf: testaPdf,
    corpoPdf: corpoPdf,
    nomeFile: nomeFile,
    relValido: relValido,
    voceSnella: voceSnella,
    pienaDaFile: pienaDaFile,
    rilettaUguale: rilettaUguale,
    cartellaPerId: cartellaPerId,
    idDaIndice: idDaIndice,
    cartellaPerNome: cartellaPerNome,
    pianoMigrazione: pianoMigrazione,
    oltreIlTetto: oltreIlTetto,
    esitoNonEntra: esitoNonEntra
  };
});
