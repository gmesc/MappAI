/*
 * mappai-riordino-core.js — la riorganizzazione di «MappAI - file» della beta.8 (0104, ADR 0023)
 * -----------------------------------------------------------------------
 * Logica PURA: nessun fs, nessun DOM. main.js descrive che cosa c'è sul disco,
 * qui si decide che cosa va dove; main.js sposta e scrive il registro; la
 * finestra (mappai-riordino.js) ripara i riferimenti dal registro.
 *
 *  - piano(descrizione, { esiste })   → { spostamenti, conflitti, intatti, vuoteDaTogliere, cartelle }
 *  - pianoInverso(registro, { esiste }) → { spostamenti, conflitti }  (gli spostamenti fatti, al contrario)
 *  - spostamentiFatti(registro)        → tutti i `fatti` dei giri, in ordine (la finestra li applica uno per uno)
 *  - riepilogo(registro)               → { quando, tornataIndietro, spostati, rimasti: [{ da, motivo }] } per la Cabina
 *  - riparaDir(dir, coppie)            → il `dir` di un vault.json dopo gli spostamenti (o null se non cambia)
 *  - assoluto(radice, segmenti)        → percorso assoluto col separatore della radice
 *
 * I percorsi del piano sono ARRAY DI SEGMENTI relativi alla cartella madre
 * («MappAI - file»): il registro resta valido se la cartella madre si sposta.
 *
 * La descrizione (la costruisce main.js, senza logica):
 *   { radice:  [{ nome, dir, vuota }],
 *     mappe:   null | { voci: [{ nome, dir }],
 *                       progetti: [{ seg: ['4R','Scienze','Elettricità'], classDir, discDir, materia, projectId }] },
 *     classi:  null | [{ nome, dir, figli: [{ nome, dir }] }],
 *     allievi: null | [{ nome, dir, figli: [{ nome, dir }], mappeVuota,     // Allievi/<nome>/Mappe/ c'è ed è vuota
 *                        progetti: [{ nome, materia, projectId }] }] }   // quelli in Allievi/<nome>/Mappe/
 *
 * UMD: module.exports per Node, window.MappAIRiordinoCore per il browser.
 */
(function () {
  'use strict';

  var FC = (typeof module !== 'undefined' && module.exports)
    ? require('./mappai-files-core.js')
    : (typeof window !== 'undefined' ? window.MappAIFilesCore : null);

  var RE_COPIA_MAPPA = /^(mm|kg)_.+\.json$/i;
  var RE_CREDENZIALI = /^credenziali-.+\.pdf$/i;
  var LOG_010 = 'migrazione-log.json';   // scritto dalla 010 nella radice

  function _ok(nome) { return !!nome && FC.safeName(nome, '') === nome; }
  function _chiave(seg) { return seg.join('/'); }

  function piano(desc, opz) {
    desc = desc || {};
    var esiste = (opz && typeof opz.esiste === 'function') ? opz.esiste : function () { return false; };
    var SUB = FC.SUB, SIS = SUB.system, CLS = SUB.classes, ALL = SUB.students;
    var spostamenti = [], conflitti = [], intatti = [], vuoteDaTogliere = [];
    var prese = Object.create(null);

    function sposta(da, a, tipo, extra) {
      var motivo = null;
      for (var i = 0; i < a.length; i++) if (!_ok(a[i])) { motivo = 'nome-non-valido'; break; }
      if (!motivo) for (var j = 0; j < da.length; j++) if (!_ok(da[j])) { motivo = 'nome-non-valido'; break; }
      if (!motivo && prese[_chiave(a)]) motivo = 'stessa-destinazione';
      if (!motivo && esiste(a)) motivo = 'destinazione-esiste';
      if (motivo) { conflitti.push({ da: da, a: a, tipo: tipo, motivo: motivo }); return; }
      prese[_chiave(a)] = true;
      var s = { da: da, a: a, tipo: tipo };
      if (extra && FC.idProgettoValido(extra.projectId)) s.projectId = extra.projectId;
      spostamenti.push(s);
    }
    function materia(m) { return FC.safeName(m, ''); }

    // 1. le cartelle di sistema in testa: Diagnostica per prima (ci va il registro)
    var radice = desc.radice || [];
    FC.SISTEMA_DA_RADICE.forEach(function (nome) {
      var v = radice.filter(function (x) { return x && x.nome === nome && x.dir; })[0];
      if (!v) return;
      if (nome === SUB.gardens && v.vuota) { vuoteDaTogliere.push([nome]); return; }   // bivio 4
      sposta([nome], [SIS, nome], 'sistema');
    });
    radice.forEach(function (x) {
      if (!x) return;
      if (!x.dir && x.nome === LOG_010) { sposta([x.nome], [SIS, FC.DIAGNOSTICA, x.nome], 'sistema'); return; }
      var noto = FC.RADICE_V2.indexOf(x.nome) >= 0 || x.nome === SUB.maps || FC.SISTEMA_DA_RADICE.indexOf(x.nome) >= 0 || x.nome === '.DS_Store';
      if (!noto) intatti.push([x.nome]);   // bivio 5, N3: Analisi, ESEMPI, i .log
    });

    // 2. classi.json e le credenziali di ogni classe
    (desc.classi || []).forEach(function (c) {
      if (!c) return;
      if (!c.dir) {
        if (c.nome === FC.CLASSI_JSON) sposta([CLS, c.nome], [SIS, c.nome], 'classi-json');   // bivio 6
        else if (c.nome !== '.DS_Store') intatti.push([CLS, c.nome]);
        return;
      }
      if (c.nome === FC.CREDENZIALI || c.nome === FC.SENZA_CLASSE) return;   // già della struttura nuova
      (c.figli || []).forEach(function (f) {
        if (f && !f.dir && RE_CREDENZIALI.test(f.nome)) sposta([CLS, c.nome, f.nome], [CLS, FC.CREDENZIALI, f.nome], 'credenziali');
      });
    });

    // 3. i progetti di Mappe/
    var m = desc.mappe;
    if (m) {
      (m.progetti || []).forEach(function (p) {
        if (!p || !p.seg || !p.seg.length) return;
        var nome = p.seg[p.seg.length - 1], a;
        if (p.classDir && p.classDir !== FC.GENERICO && p.classDir !== FC.SENZA_CLASSE) {
          if (p.classDir === FC.CREDENZIALI) { conflitti.push({ da: [SUB.maps].concat(p.seg), a: null, tipo: 'progetto', motivo: 'classe-riservata' }); return; }
          a = [CLS, p.classDir].concat(p.discDir ? [p.discDir] : [], [nome]);
        } else {
          /* senza classe (Generico, Senza classe, piatto): la materia della cartella
             se c'è, altrimenti quella dichiarata in index.yaml (N4, N8) */
          var mat = p.discDir || materia(p.materia);
          a = [CLS, FC.SENZA_CLASSE].concat(mat ? [mat] : [], [nome]);
        }
        sposta([SUB.maps].concat(p.seg), a, 'progetto', p);
      });
      (m.voci || []).forEach(function (v) {
        if (!v) return;
        if (!v.dir && RE_COPIA_MAPPA.test(v.nome)) sposta([SUB.maps, v.nome], [SIS, FC.COPIE_MAPPE, v.nome], 'copia-mappa');   // N1
        else if (v.dir && FC.CONTENITORI_RIPIEGO.indexOf(v.nome) >= 0) sposta([SUB.maps, v.nome], [SIS, v.nome], 'sistema');   // N2
        else if (!v.dir && v.nome !== '.DS_Store') intatti.push([SUB.maps, v.nome]);
      });
    }

    // 4. gli allievi: i progetti fuori da Mappe/, le tessere fra le credenziali
    (desc.allievi || []).forEach(function (s) {
      if (!s || !s.dir) return;
      (s.progetti || []).forEach(function (p) {
        if (!p || !p.nome) return;
        var mat = materia(p.materia);
        sposta([ALL, s.nome, SUB.maps, p.nome], [ALL, s.nome].concat(mat ? [mat] : [], [p.nome]), 'progetto', p);
      });
      (s.figli || []).forEach(function (f) {
        if (f && !f.dir && RE_CREDENZIALI.test(f.nome)) sposta([ALL, s.nome, f.nome], [CLS, FC.CREDENZIALI, f.nome], 'credenziali');   // bivio 8
      });
      if (s.mappeVuota) vuoteDaTogliere.push([ALL, s.nome, SUB.maps]);   // la «Mappe» di prima, vuota
    });

    return {
      spostamenti: spostamenti, conflitti: conflitti, intatti: intatti, vuoteDaTogliere: vuoteDaTogliere,
      cartelle: FC.RADICE_V2.map(function (n) { return [n]; })
    };
  }

  // Tutti gli spostamenti FATTI, nell'ordine in cui sono avvenuti (avanti e indietro).
  function spostamentiFatti(registro) {
    var out = [];
    ((registro && registro.giri) || []).forEach(function (g) {
      (g && g.fatti || []).forEach(function (f) { if (f && f.da && f.a) out.push(f); });
    });
    return out;
  }

  /* Il ritorno indietro: gli spostamenti ancora in piedi, rovesciati e in ordine
     inverso. «In piedi» = fatti in un giro avanti dopo l'ultimo giro indietro. */
  function pianoInverso(registro, opz) {
    var esiste = (opz && typeof opz.esiste === 'function') ? opz.esiste : function () { return false; };
    var giri = (registro && registro.giri) || [], ultimo = -1;
    giri.forEach(function (g, i) { if (g && g.verso === 'indietro') ultimo = i; });
    var daRovesciare = [];
    giri.forEach(function (g, i) {
      if (i > ultimo && g && g.verso !== 'indietro') (g.fatti || []).forEach(function (f) { daRovesciare.push(f); });
    });
    var spostamenti = [], conflitti = [];
    daRovesciare.reverse().forEach(function (f) {
      var s = { da: f.a, a: f.da, tipo: f.tipo };
      if (f.projectId) s.projectId = f.projectId;
      if (esiste(s.a)) conflitti.push(Object.assign({ motivo: 'destinazione-esiste' }, s));
      else spostamenti.push(s);
    });
    return { spostamenti: spostamenti, conflitti: conflitti };
  }

  /* Il riepilogo per la Cabina: dall'ultimo ritorno indietro in poi, quanti pezzi
     sono stati spostati e quali sono rimasti al loro posto (dell'ultimo giro avanti:
     quelli prima sono stati riprovati), col motivo. → null senza registro. */
  function riepilogo(registro) {
    var giri = (registro && registro.giri) || [];
    if (!giri.length) return null;
    var ultimo = giri[giri.length - 1], indietro = ultimo && ultimo.verso === 'indietro';
    var dal = -1;
    giri.forEach(function (g, i) { if (g && g.verso === 'indietro') dal = i; });
    var spostati = 0, ultimoAvanti = null;
    giri.forEach(function (g, i) {
      if (i > dal && g && g.verso !== 'indietro') { spostati += (g.fatti || []).length; ultimoAvanti = g; }
    });
    var g = indietro ? ultimo : ultimoAvanti;
    var rimasti = [];
    if (g) {
      (g.conflitti || []).forEach(function (c) { if (c && c.da) rimasti.push({ da: c.da.join('/'), motivo: c.motivo || 'conflitto' }); });
      (g.falliti || []).forEach(function (f) { if (f && f.da) rimasti.push({ da: f.da.join('/'), motivo: 'non-riuscito', errore: f.errore || '' }); });
    }
    return {
      quando: (g && (g.fine || g.inizio)) || '',
      tornataIndietro: indietro,
      spostati: indietro ? (ultimo.fatti || []).length : spostati,
      rimasti: rimasti
    };
  }

  function _sep(radice) { return String(radice || '').indexOf('\\') >= 0 && String(radice).indexOf('/') < 0 ? '\\' : '/'; }
  function assoluto(radice, segmenti) {
    var r = String(radice || ''), sep = _sep(r);
    if (r.slice(-1) === sep) r = r.slice(0, -1);
    return [r].concat(segmenti || []).join(sep);
  }

  /* Il `dir` di un vault.json (server di rete locale) dopo gli spostamenti:
     coppie = [{ da: '/abs/vecchio', a: '/abs/nuovo' }]. Vince la coppia più lunga. */
  function riparaDir(dir, coppie) {
    var d = String(dir || '');
    if (!d) return null;
    var best = null;
    (coppie || []).forEach(function (c) {
      if (!c || !c.da) return;
      var da = String(c.da);
      if (d === da || (d.indexOf(da) === 0 && (d.charAt(da.length) === '/' || d.charAt(da.length) === '\\'))) {
        if (!best || da.length > best.da.length) best = { da: da, a: String(c.a) };
      }
    });
    return best ? best.a + d.slice(best.da.length) : null;
  }

  var CORE = {
    piano: piano,
    pianoInverso: pianoInverso,
    spostamentiFatti: spostamentiFatti,
    riepilogo: riepilogo,
    riparaDir: riparaDir,
    assoluto: assoluto,
    RE_COPIA_MAPPA: RE_COPIA_MAPPA,
    RE_CREDENZIALI: RE_CREDENZIALI
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CORE;
  if (typeof window !== 'undefined') window.MappAIRiordinoCore = CORE;
})();
