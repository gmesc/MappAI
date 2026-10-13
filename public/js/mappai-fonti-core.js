/*
 * mappai-fonti-core.js — dove sta il PDF della fonte (packet 0059, ADR 0011
 * revisione 1). Logica PURA: niente pagina, niente disco, niente canali verso
 * il processo principale. L'I/O lo fa ELABORA (`mappai-elabora.js`), che chiede
 * qui che cosa leggere, che cosa scrivere e con quale nome; la revisione del
 * docente (`mappai-review.js`) chiede in quale cartella sta il PDF di un titolo.
 *
 * PERCHÉ. Il PDF della fonte arrivava sul disco per due strade che non si
 * parlavano: ELABORA lo scriveva in `Fonti/` (con `fonti.json`), la pipeline di
 * CREA lo copiava in `Allegati/`. Riaprendo un vault di CREA, ELABORA — che
 * guardava solo `Fonti/` — diceva che il progetto non aveva fonti (44 vault al
 * censimento del 28/09). Da qui in avanti il PDF si scrive in `Fonti/`, e
 * `Allegati/` si LEGGE soltanto.
 *
 * LE DUE REGOLE.
 *  · operativa, che cosa si SCRIVE (ADR 0011 rev. 1, punto 2): in `Fonti/` solo
 *    se il vault nasce da questa stessa azione, oppure se `Fonti/` c'è già —
 *    cioè l'elenco della cartella ha almeno un file: una `Fonti/` vuota vale
 *    come assente. Unica eccezione: «Aggiungi PDF» di un file nuovo.
 *  · di lettura, che cosa si VEDE (B2 «per nome», Giacomo, 28/09): un PDF di
 *    `Allegati/` si mostra, in sola lettura, se `Fonti/` non ha un PDF con lo
 *    stesso nome (senza badare alle maiuscole); la revisione cerca il titolo
 *    prima fra i PDF di `Fonti/`, poi fra quelli di `Allegati/`. È una lettura
 *    più larga delle righe 208-209 della revisione 1 («`Allegati/` dove `Fonti/`
 *    non ha nessun PDF»): la allarga Giacomo, non questo file. Qui la regola è
 *    UNA, per ELABORA e per la revisione insieme.
 *
 * `vaultDi`. Un `vaultRel` è relativo, e da solo non dice DI QUALE vault è: due
 * generazioni di fila con lo stesso PDF lasciavano il secondo vault senza il suo
 * file e con un indice che puntava al file di un altro vault. `vaultDi` è il
 * percorso assoluto del vault in cui `vaultRel` vale. Resta in memoria e nella
 * scheda del progetto: non entra mai in `fonti.json` (regola DAL, CLAUDE.md §5).
 *
 * ⚠️ Nomi e percorsi si confrontano nella STESSA forma (trappole 25 e 50): i
 * nomi in NFC e senza maiuscole, i percorsi dei vault in NFC e senza il
 * separatore finale. APFS conserva la forma di chi ha creato il nome, quindi
 * «Présent» può arrivare composto da un lato e scomposto dall'altro.
 *
 * `nomeLibero` NON si riscrive qui (invariante 6): è quello di
 * `MappAIPipelineCore`, letto al momento della chiamata.
 *
 * UMD: module.exports in Node, window.MappAIFontiCore nel renderer. NON è
 * copiato nel reader. Test: tests/fonti-core.test.js.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(root, true);
  else root.MappAIFontiCore = factory(root, false);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, inNode) {
  'use strict';

  /* ── dipendenze, lette a ogni chiamata ─────────────────────────────────────
     Mai al caricamento: nel renderer `mappai-pipeline-core.js` sta prima di
     questo file, ma una vm di prova può caricarli in un altro ordine. Se manca,
     `sceltaNome` fallisce rumorosamente: chi scrive non deve inventarsi un nome. */
  function _dep(globale, file) {
    if (inNode) return require(file);
    return root && root[globale];
  }
  function PipelineCore() {
    var pc = _dep('MappAIPipelineCore', './mappai-pipeline-core.js');
    if (!pc || typeof pc.nomeLibero !== 'function') fail('pipeline-core-assente');
    return pc;
  }
  function fail(code) { var e = new Error(code); e.code = code; throw e; }

  function _testo(v) { return String(v == null ? '' : v); }
  function _nfc(v) { var s = _testo(v); return typeof s.normalize === 'function' ? s.normalize('NFC') : s; }
  function _chiaveNome(v) { return _nfc(v).toLowerCase(); }
  function _stessoVault(a, b) {
    var x = _nfc(a).replace(/[\\/]+$/, ''), y = _nfc(b).replace(/[\\/]+$/, '');
    return !!x && x === y;
  }
  function _lista(x) { return Array.isArray(x) ? x : []; }
  function _escapeRe(s) { return _testo(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  /* Gli elenchi della revisione sono NOMI; un `{ name }` dell'elenco del vault
     si accetta lo stesso, invece di diventare «[object Object]». */
  function _nomi(lista) {
    return _lista(lista).map(function (x) { return (x && typeof x === 'object') ? _testo(x.name) : _testo(x); });
  }

  function isPdf(nome) { return /\.pdf$/i.test(_testo(nome)); }
  /* Una fonte letta da `Allegati/` (marcata dal ripristino, o col percorso che
     lo dice): sola lettura, non entra mai in una scrittura né nell'indice. */
  function inAllegati(s) { return !!(s && (s.daAllegati || /^Allegati\//i.test(_testo(s.vaultRel)))); }

  /* ══ 1. LETTURA — le fonti di un vault riaperto (ELABORA) ═══════════════════
     `indice`   = il contenuto di `Fonti/fonti.json`, o null;
     `fonti`    = l'elenco di `Fonti/` ({ name, relPath, size, ext }), con
                  `fonti.json` e i `.txt`;
     `allegati` = l'elenco di `Allegati/` ({ name, size }). Il suo `relPath`
                  NON si usa: con `dir:'Allegati'` il processo principale lo
                  compone come «Materiale Studio/…» (main.js:1267). Il percorso
                  si ricompone qui, 'Allegati/' + nome.
     Gradino 1 l'indice; gradino 2, senza indice, i PDF di `Fonti/`. Poi, per
     nome (B2), i PDF di `Allegati/` che `Fonti/` non ha. Ogni voce porta
     `vaultDi` = il vault passato. Il testo dai `.txt` lo legge chi chiama. */
  function fontiDaRipristinare(elenchi, vaultPath) {
    var e = elenchi || {};
    var indice = e.indice, fonti = _lista(e.fonti), allegati = _lista(e.allegati);
    var voci = (indice && Array.isArray(indice.fonti))
      ? indice.fonti.filter(function (v) { return v && typeof v === 'object'; }).map(function (v, i) {
        return { id: v.id || ('src' + i), type: v.tipo || 'text', name: v.nome || '', vaultRel: v.vaultRel || '', testoRel: v.testoRel || '' };
      })
      : fonti.filter(function (f) { return f && isPdf(f.name); }).map(function (f, i) {
        return { id: 'vault-' + i, type: 'pdf', name: f.name, vaultRel: 'Fonti/' + f.name, testoRel: '' };
      });
    var pdfFonti = fonti.filter(function (f) { return f && isPdf(f.name); }).map(function (f) { return _chiaveNome(f.name); });
    var extra = allegati.filter(function (a) { return a && isPdf(a.name) && pdfFonti.indexOf(_chiaveNome(a.name)) < 0; })   // B2 «per nome»
      .map(function (a, i) {
        return { id: 'allegati-' + i, type: 'pdf', name: a.name, vaultRel: 'Allegati/' + a.name, testoRel: '', daAllegati: true };
      });
    return voci.concat(extra).map(function (v) { v.vaultDi = vaultPath || ''; return v; });
  }

  /* ══ 2. CHI SI SCRIVE, E DOVE ═══════════════════════════════════════════════
     `nomeNascosto`: un nome che l'elenco di `Fonti/` non può mostrare.
     `vault-sources-list` salta i file che cominciano per «.» (main.js:1291,
     «.DS_Store & co.»), mentre `safeName` quel punto lo conserva: un PDF scelto
     come «.appunti.pdf» si scrive in `Fonti/` col suo nome, e poi l'elenco non
     lo vede. Per un nome così l'elenco non dice né sì né no.
     `presenteIn`: il file di `vaultRel` c'è nell'elenco di `Fonti/` di un vault
     (i file `{ name }` o i nomi)? Solo un percorso di `Fonti/` può esserci; il
     nome si confronta nella stessa forma (NFC, senza maiuscole: trappola 25).
     Serve a non fidarsi della memoria: un `vaultRel` col `vaultDi` giusto può
     puntare a un file che non c'è più — il vault eliminato (INSEGNA › Elimina
     lo manda nel Cestino, e le fonti restano in memoria) e ricreato allo stesso
     percorso da una generazione con lo stesso titolo.
     → true / false; `undefined` = non si sa, per un nome nascosto: chi chiama
     fa come prima di questa regola (il file c'è). Senza, «.appunti.pdf» usciva
     dall'indice appena scritto e ogni flush ritentava di riscriverlo. */
  function nomeNascosto(nome) { return _testo(nome).charAt(0) === '.'; }
  function presenteIn(vaultRel, elenco) {
    var m = /^Fonti\/(.+)$/i.exec(_testo(vaultRel));
    if (!m) return false;
    if (nomeNascosto(m[1])) return undefined;
    var chiave = _chiaveNome(m[1]);
    return _nomi(elenco).some(function (n) { return _chiaveNome(n) === chiave; });
  }
  /* `daScrivere`: il PDF di una fonte va scritto in `Fonti/` di `vaultPath`?
     Mai una fonte di `Allegati/`, mai senza il File in memoria. Con `vaultRel`
     si riscrive se vale in un ALTRO vault (seconda generazione: vault nuovo,
     PDF suo), oppure se vale in QUESTO ma il suo file qui non c'è
     (`presenteQui === false`, da `presenteIn` sull'elenco di `Fonti/`: il vault
     ricreato allo stesso percorso). `presenteQui` assente = non si sa: come
     prima, il file c'è. Senza `vaultDi` si fa come prima dello 0059: c'è già. */
  function daScrivere(f, vaultPath) {
    var x = f || {};
    if (!x.isPdf || !x.haFile || inAllegati({ vaultRel: x.vaultRel, daAllegati: x.daAllegati })) return false;
    if (!x.vaultRel) return true;
    if (!x.vaultDi) return false;
    return !_stessoVault(x.vaultDi, vaultPath) || x.presenteQui === false;
  }
  /* La regola operativa. `fontiPresente` = l'elenco di `Fonti/` ha almeno un
     file; `aggiunta` = «Aggiungi PDF» di un file nuovo, l'eccezione firmata;
     `completa` (0078, §4.4) = «Riprendi» dà `Fonti/` alla cartella di questo
     progetto che non ce l'ha, dalle fonti in memoria. `completa` non porta gli
     effetti di `vaultNuovo`: la cartella c'era, e i `vaultRel` delle fonti
     restano quelli che sono (`vaultRelPerIndice`, `vaultSpostato`). */
  function puoScrivereFonti(o) {
    var x = o || {};
    return !!(x.vaultNuovo || x.fontiPresente || x.aggiunta || x.completa);
  }
  /* Le voci che possono entrare in `fonti.json`: tutte, tranne quelle lette da
     `Allegati/`. */
  function vociScrivibili(fonti) {
    return _lista(fonti).filter(function (s) { return s && !inAllegati(s); });
  }
  /* Il `vaultRel` che entra nell'indice di `vaultPath`: mai uno che vale solo in
     un altro vault, e mai uno il cui file qui manca (`presenteQui === false`,
     da `presenteIn` sull'elenco di `Fonti/`; assente = non si sa, come prima).
     Senza `vaultDi` come prima dello 0059, tranne su un vault nato adesso, che
     non può avere niente di suo prima di questo flush. */
  function vaultRelPerIndice(src, vaultPath, vaultNuovo, presenteQui) {
    if (!src || !src.vaultRel || presenteQui === false) return '';
    if (src.vaultDi) return _stessoVault(src.vaultDi, vaultPath) ? src.vaultRel : '';
    return vaultNuovo ? '' : src.vaultRel;
  }
  /* Un vault SPOSTATO (INSEGNA › un'altra disciplina, «Organizza i file»): la
     cartella è la stessa sotto un altro percorso, e chi la sposta aggiorna
     `activeVaultPath`, non le fonti — il loro `vaultDi` resta il percorso di
     prima, e `vaultRelPerIndice` toglieva dall'indice un `vaultRel` che qui
     vale. Il vault è lo stesso se il file di `vaultRel` c'è QUI e non c'è più
     LÀ, nel vault di `vaultDi`: se c'è ancora là, è l'altro vault di due
     generazioni di fila e resta fuori. Un vault nato adesso non è mai uno
     spostato: la sua `Fonti/` l'ha appena scritta il flush, e un file con lo
     stesso nome può essere il PDF di un'altra fonte.
     `elenchi` = { qui, la }: i file (o i nomi) di `Fonti/` nei due vault.
     → true: chi chiama riallinea `vaultDi` al vault che scrive. */
  function vaultSpostato(src, vaultPath, vaultNuovo, elenchi) {
    var x = src || {}, e = elenchi || {};
    if (vaultNuovo || !x.vaultRel || !x.vaultDi || _stessoVault(x.vaultDi, vaultPath) || inAllegati(x)) return false;
    var m = /^Fonti\/(.+)$/i.exec(_testo(x.vaultRel));
    if (!m) return false;
    var chiave = _chiaveNome(m[1]);
    function ha(lista) { return _nomi(lista).some(function (n) { return _chiaveNome(n) === chiave; }); }
    return ha(e.qui) && !ha(e.la);
  }
  /* L'indice: mai un `fonti: []` dove `Fonti/` non c'era; sempre riscrivibile
     dove c'è (il docente può aver tolto tutte le fonti). Col motivo `completa`
     (0078) come con un vault nuovo: solo se ci sono delle voci. */
  function scriviIndice(o) {
    var x = o || {};
    return !!(x.fontiPresente || ((x.vaultNuovo || x.pdfScritto || x.completa) && _lista(x.voci).length > 0));
  }

  /* ══ 3. IL NOME — adottare un file uguale, o il primo nome libero ═══════════
     `gemelli`: fra i file di `Fonti/` ({ name, size }), quelli che potrebbero
     essere LO STESSO PDF — stesso nome, o lo stesso con « · NN», e la stessa
     dimensione. Sono candidati: i byte li confronta chi chiama (l'elenco dà
     metadati, non contenuto: trappola 45). « · NNN» si riconosce perché il
     ciclo di prima dello 0059 al decimo tentativo scriveva « · 010». */
  function gemelli(nome, esistenti, taglia) {
    if (typeof taglia !== 'number' || !isFinite(taglia)) return [];
    var base = _chiaveNome(nome).replace(/\.pdf$/i, '');
    var re = new RegExp('^' + _escapeRe(base) + '( · \\d{2,3})?\\.pdf$', 'i');
    return _lista(esistenti).filter(function (e) {
      return e && e.size === taglia && re.test(_chiaveNome(e.name));
    }).map(function (e) { return e.name; });
  }
  /* `uguali` = i gemelli che chi chiama ha trovato con gli stessi byte.
     → { adotta: nome sul disco } nessuna seconda copia;
     → { scrivi: nome }           « · 02» … « · 99» da `nomeLibero`;
     → null                       l'originale e le 98 varianti ci sono già: chi
                                  chiama non scrive e lo dice. */
  function sceltaNome(nome, esistenti, uguali) {
    var u = _lista(uguali);
    if (u.length) return { adotta: u[0] };
    var nomi = _lista(esistenti).map(function (e) { return _nfc(e && typeof e === 'object' ? e.name : e); });
    var libero = PipelineCore().nomeLibero(_nfc(nome), nomi);
    return libero ? { scrivi: libero } : null;
  }

  /* ══ 4. REVISIONE — in quale cartella sta il PDF di un titolo ═══════════════
     `fonti`/`allegati` = i NOMI dei file delle due cartelle; `trova` =
     `MappAIReviewFonte.trovaPdf`, passata da fuori (confronta già solo i
     `.pdf`, per nome identico e poi equivalente). B2 «per nome»: prima
     `Fonti/`, poi `Allegati/`. Senza `trova`, nessun PDF: la revisione mostra
     il testo archiviato, come quando il PDF non c'è. */
  function pdfPerTitolo(titolo, elenchi, trova) {
    if (typeof trova !== 'function') return null;
    var e = elenchi || {};
    var f = trova(titolo, _nomi(e.fonti));
    if (f) return 'Fonti/' + f;
    var a = trova(titolo, _nomi(e.allegati));
    return a ? 'Allegati/' + a : null;
  }

  /* L'interruttore `mappai_fonte_in_fonti`: acceso di default, spento solo con
     '0'. Governa la sola SCRITTURA; la lettura da tutte e due le cartelle resta
     accesa comunque. Il valore lo legge ELABORA (`fonteInFonti`, unico lettore). */
  function interruttoreAcceso(v) { return v !== '0'; }

  return {
    isPdf: isPdf, inAllegati: inAllegati,
    fontiDaRipristinare: fontiDaRipristinare,
    nomeNascosto: nomeNascosto, presenteIn: presenteIn, daScrivere: daScrivere, puoScrivereFonti: puoScrivereFonti,
    vociScrivibili: vociScrivibili, vaultRelPerIndice: vaultRelPerIndice, vaultSpostato: vaultSpostato, scriviIndice: scriviIndice,
    gemelli: gemelli, sceltaNome: sceltaNome,
    pdfPerTitolo: pdfPerTitolo,
    interruttoreAcceso: interruttoreAcceso
  };
}));
