/*
 * mappai-evidence-core.js — le evidenze: la frase VERA della fonte, con documento
 * e pagina, che un generatore riceve e cita per identificatore (ADR 0002,
 * invariante 22). Passi 1 e 2 del piano Evidence (docs/tasks/0001-evidence-core.md,
 * docs/tasks/0002-evidence-indice.md).
 *
 * Cinque funzioni, tutte pure (niente DOM, IPC, modelli, timer):
 *   · tipizza(unita)            → la stessa unità con un `genere`;
 *   · costruisciPacchetto(...)  → da una query, le unità che un generatore leggerà,
 *                                 con tetto e scarti contati;
 *   · formattaPerPrompt(p)      → il blocco di testo con gli id `[[ev-…]]`;
 *   · costruisciIndice(fonti)   → `evidenze.json`: un record per pagina, con in
 *                                 testa la revisione di ogni fonte (passo 2);
 *   · indiceStantio(indice, f)  → se l'indice letto dal disco va rifatto.
 *
 * Che cosa NON si rifà qui (invariante 6, una verità una fonte):
 *   · il BM25 e il filtro delle frasi sono di `lexical()` (local-search-core →
 *     frasiDaPagine dell'àncora): le domande, le consegne, le didascalie, le
 *     intestazioni ricorrenti e le frasi troncate in un vuoto NON arrivano qui;
 *   · l'hash dell'id è `revision()` di review-core, lo stesso di local-search;
 *   · il testo è VERBATIM: nessun ritocco oltre `trim()`. Una citazione si
 *     scarta, non si ripulisce (HANDOFF 19/9 sera, 64936d4).
 *
 * L'interruttore `mappai_evidence` e il reranker via IPC vivono nella cucitura
 * (passo 2), mai qui: `punteggi` è solo la porta da cui un voto esterno entra.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mappai-local-search-core'), require('./mappai-boilerplate-core'), require('./mappai-review-core'));
  else root.MappAIEvidenceCore = factory(root.MappAILocalSearchCore, root.MappAIBoilerplate, root.MappAIReviewCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (LS, BP, RC) {
  'use strict';

  /* ── LE REGOLE DI TIPIZZAZIONE, NELL'ORDINE: la prima che vale vince ──────
     Deterministiche, zero AI. Sul percorso del pacchetto arrivano solo
     concetto/definizione/dato (le altre tre le toglie già l'àncora attraverso
     `lexical`); domanda/consegna/didascalia servono all'indice del passo 2.
     ⚠️ Due regex sono COPIE dichiarate delle regole B e A di
     `MappAIBoilerplate.isStructuralLine`, che risponde solo sì/no e qui serve
     il nome del genere. Se nascerà `structuralKind` (packet 0002), le due
     righe si appoggiano lì. */
  var REGOLE = [
    // 1. domanda: finisce con «?» (lo stesso test di mappai-anchor-core.js:230) o apre con uno stem numerato «1)» «2.» (regola B di isStructuralLine, copiata)
    { genere: 'domanda', vale: function (t) { return /\?\s*$/.test(t) || /^\d{1,2}\s*[\).]\s+\S/.test(t); } },
    // 2. consegna: apre con un verbo dell'elenco chiuso — senza badare alla maiuscola, come ESERCIZIO dell'àncora: dopo un due punti la consegna arriva minuscola — o è una riga di soli puntini/trattini, lo spazio risposta (regola A di isStructuralLine, copiata)
    { genere: 'consegna', vale: function (t) { return /^(Completa|Indica|Spiega|Descrivi|Calcola|Rispondi|Osserva|Collega|Scrivi|Leggi|Sottolinea|Elenca|Confronta|Disegna|Riordina)\b/i.test(t) || (/^[.·_…—–\-\s]{6,}$/.test(t) && !/[0-9A-Za-zÀ-ſ]/.test(t)); } },
    // 3. didascalia: ciò che resta di isStructuralLine quando 1 e 2 non valgono (regole C e D: «Doc. 1», «Fig. 2», «Tab. 3», titoli tutti maiuscoli)
    { genere: 'didascalia', vale: function (t) { return !!(BP && typeof BP.isStructuralLine === 'function' && BP.isStructuralLine(t)); } },
    // 4. definizione: fra la 2ª e la 12ª parola compare « è » / « sono » / «si chiama» / «si definisce» / «si dice» (parola 1, poi da 0 a 10 parole, poi il marcatore)
    { genere: 'definizione', vale: function (t) { return /^\S+(?:\s+\S+){0,10}\s+(?:è|sono|si\s+chiama|si\s+definisce|si\s+dice)\s/i.test(t); } },
    // 5. dato: un numero con unità o «%» (il \b sta solo dopo le unità a lettere: dopo «%» non c'è mai un confine di parola e la regola sarebbe morta), un anno a quattro cifre, una data
    { genere: 'dato', vale: function (t) { return /\d+([.,]\d+)?\s?(?:%|(?:km|m|cm|kg|g|°C|anni|milioni|miliardi)\b)/.test(t) || /\b1[0-9]{3}\b|\b20[0-9]{2}\b/.test(t) || /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/.test(t); } },
    // 6. concetto: tutto il resto
    { genere: 'concetto', vale: function () { return true; } }
  ];

  /* Il tetto del pacchetto: quante unità e quanti caratteri di testo un
     generatore riceve. Numeri da tarare al passo 3 sui prompt veri. */
  var TETTO = { unita: 8, caratteri: 1600 };

  /* Il genere di un'unità. Accetta l'oggetto `{ text, … }` o, nei test, la
     stringa nuda. Restituisce una COPIA: l'unità che entra non si tocca. */
  function tipizza(unita) {
    var copia = unita && typeof unita === 'object' ? Object.assign({}, unita) : { text: unita };
    var t = String(copia.text == null ? '' : copia.text).trim();
    for (var i = 0; i < REGOLE.length; i++) {
      if (REGOLE[i].vale(t)) { copia.genere = REGOLE[i].genere; return copia; }
    }
    copia.genere = 'concetto';   // irraggiungibile: la regola 6 vale sempre
    return copia;
  }

  /* L'id di un'unità è un dato del prodotto (invariante 22): deve rinascere
     uguale a ogni costruzione, perché un materiale salvato lo cita e domani
     lo si deve ritrovare. Dipende SOLO da fonte, pagina e testo — non dal
     punteggio, non dalla query, non dalla posizione. Stesso hash di
     local-search-core (`revision` di review-core, forma r1-<16 hex>-<n>). */
  function idUnita(sourceId, page, text) {
    var h = RC.revision({ items: [{ id: 'ev', value: [sourceId, page, text] }] }, []);
    return 'ev-' + String(h).slice(3);
  }

  function pacchettoVuoto(query) {
    return { unita: [], query: query, punteggi: { lessicali: 0, esterni: 0 }, scartate: 0 };
  }

  /* Da una query (etichetta o descrizione di un ramo) al pacchetto di evidenze.
     I candidati sono quelli di `lexical(records, query, 'evidence')`: al massimo
     20, in ordine BM25, già filtrati dall'àncora. `punteggi` è la mappa
     `text → voto` di un riordinatore esterno: se c'è, comanda l'ordine (voto
     decrescente; le unità senza voto vanno in coda, nell'ordine di BM25).
     Il tetto si applica scorrendo in ordine: un'unità entra solo se reggono
     ENTRAMBI i limiti, le altre si contano in `scartate`. Mai un'eccezione:
     senza fonti o senza query il pacchetto è vuoto, non un errore. */
  function costruisciPacchetto(input) {
    var o = input && typeof input === 'object' ? input : {};
    var query = typeof o.query === 'string' ? o.query : '';
    var records = Array.isArray(o.records) ? o.records : [];
    if (!records.length || !query.trim()) return pacchettoVuoto(query);

    var candidati = LS.lexical(records, query, 'evidence');
    if (!candidati || !candidati.length) return pacchettoVuoto(query);

    var tetto = {
      unita: o.tetto && Number(o.tetto.unita) > 0 ? Number(o.tetto.unita) : TETTO.unita,
      caratteri: o.tetto && Number(o.tetto.caratteri) > 0 ? Number(o.tetto.caratteri) : TETTO.caratteri
    };
    var voti = o.punteggi && typeof o.punteggi === 'object' ? o.punteggi : null;

    var ordinate = candidati.map(function (c, rango) {
      var text = String(c.text == null ? '' : c.text).trim();
      var esterno = !!(voti && Object.prototype.hasOwnProperty.call(voti, text) && typeof voti[text] === 'number' && !isNaN(voti[text]));
      var unita = tipizza({
        id: idUnita(c.sourceId, c.page, text),
        text: text,
        page: c.page,
        title: c.title,
        sourceId: c.sourceId,
        origin: c.origin,
        punteggio: esterno ? voti[text] : (c.scores && typeof c.scores.lexical === 'number' ? c.scores.lexical : 0)
      });
      return { unita: unita, esterno: esterno, rango: rango };
    });
    if (voti) {
      /* Chi ha un voto sta davanti, per voto; chi non ne ha (il riordinatore
         non l'ha visto) resta dietro, nell'ordine in cui BM25 l'aveva messo. */
      ordinate.sort(function (a, b) {
        if (a.esterno !== b.esterno) return a.esterno ? -1 : 1;
        if (a.esterno && a.unita.punteggio !== b.unita.punteggio) return b.unita.punteggio - a.unita.punteggio;
        return a.rango - b.rango;
      });
    }

    var tenute = [], caratteri = 0, scartate = 0, lessicali = 0, esterni = 0;
    ordinate.forEach(function (x) {
      var lunghezza = x.unita.text.length;
      if (tenute.length < tetto.unita && caratteri + lunghezza <= tetto.caratteri) {
        tenute.push(x.unita);
        caratteri += lunghezza;
        if (x.esterno) esterni++; else lessicali++;
      } else {
        scartate++;
      }
    });
    return { unita: tenute, query: query, punteggi: { lessicali: lessicali, esterni: esterni }, scartate: scartate };
  }

  /* Il blocco che un generatore legge: una riga per unità, nell'ordine del
     pacchetto, senza intestazione né istruzioni (le mette il generatore,
     passo 4). Nessun testo viene troncato: se non ci stava, non è entrato a
     monte. Con pagina 0 (fonte senza pagine: testo incollato, URL) la
     parentesi non dice «p. 0», che sarebbe una pagina che non esiste. */
  function formattaPerPrompt(pacchetto) {
    var unita = pacchetto && Array.isArray(pacchetto.unita) ? pacchetto.unita : [];
    return unita.map(function (u) {
      var pagina = Number(u.page) > 0 ? 'p. ' + Number(u.page) + ', ' : '';
      return '[[' + u.id + ']] (' + pagina + (u.title || 'Documento') + ' · ' + u.genere + ') ' + u.text;
    }).join('\n');
  }

  /* ── L'INDICE DELLE EVIDENZE (passo 2) ─────────────────────────────────────
     `evidenze.json` nella radice del vault: le pagine delle fonti che la
     revisione conserva in pipeline.json, UN record per pagina, con in testa la
     revisione di ogni fonte. È un derivato ricostruibile a costo zero
     (invariante 7). Niente frasi e niente BM25 qui dentro: restano di
     `lexical`, che `costruisciPacchetto` chiama sui `records` di questo indice. */
  var SCHEMA_INDICE = 'mappai-evidenze@1';
  var GENERI = ['domanda', 'consegna', 'didascalia', 'definizione', 'dato', 'concetto'];

  /* Titolo e pagine come li legge `snapshot()` (local-search-core:20-21). Il
     titolo serve solo alla fonte senza una riga di testo, che non lascia
     record da cui rileggerlo; le pagine servono all'id derivato e ai generi. */
  function titoloFonte(f) {
    return f.title || f.nome || f.name || (f.file && f.file.name) || f.url || 'Documento';
  }
  function pagineFonte(f) {
    return Array.isArray(f.pages) ? f.pages : [{ n: f.page || f.n || 0, text: f.content || f.text || '' }];
  }
  function testoPagina(p) { return String((p && (p.text || p.content)) || ''); }

  /* Un id che non dipende dalla POSIZIONE. A chi non ha un id `snapshot()` dà
     `source-<posizione>`, e la revisione ordina le fonti a modo suo
     (review-core, sourceSnapshot): un id `ev-…` nato su quella base cambierebbe
     aggiungendo o spostando una fonte, e un materiale che lo cita non
     ritroverebbe più la sua prova. Se la fonte ha un id si tiene quello;
     altrimenti l'impronta del PDF (`pdfHash|hash`) o, mancando anche quella,
     titolo e testi delle pagine. Stesso hash di `idUnita`. */
  function idFonte(f) {
    var proprio = f.sourceId || f.docId || f.id;
    if (proprio) return String(proprio);
    var impronta = f.pdfHash || f.hash;
    var value = impronta ? [String(impronta)] : [titoloFonte(f), pagineFonte(f).map(testoPagina)];
    var h = RC.revision({ items: [{ id: 'fonte', value: value }] }, []);
    return 'fonte-' + String(h).slice(3);
  }

  /* La copia su cui lavora `snapshot()`: le fonti della revisione sono il dato
     di pipeline.json e non si toccano. Una stringa nuda diventa una fonte di
     solo testo, come fa `snapshot()`; ciò che non è né stringa né oggetto non
     è una fonte e si salta (il chiamante lo dichiara nella diagnostica). */
  function copiaFonte(f) {
    if (typeof f === 'string') f = { text: f };
    if (!f || typeof f !== 'object') return null;
    var copia = Object.assign({}, f);
    copia.sourceId = idFonte(f);
    return copia;
  }

  /* Che cosa contiene la fonte, riga per riga (le pagine spezzate su `\n`,
     righe vuote saltate): una scheda di esercizi si vede dai numeri. È
     diagnostica: il pacchetto non la legge. Tutti e sei i generi compaiono
     sempre, anche a zero, così il JSON ha la stessa forma su ogni fonte. */
  function contaGeneri(pagine) {
    var conto = {};
    GENERI.forEach(function (g) { conto[g] = 0; });
    pagine.forEach(function (p) {
      testoPagina(p).split('\n').forEach(function (riga) {
        if (riga.trim()) conto[tipizza(riga).genere]++;
      });
    });
    return conto;
  }

  /* Da ciò che `MappAIReview.sources()` restituisce all'indice. I `records`
     sono quelli di `snapshot()` (invariante 6), tenuti solo se `original` o
     `reference`: un generato non prova se stesso. `opts.adesso` (ISO) sostituisce
     `new Date()` nei test. Mai un'eccezione: fonti vuote o non array danno un
     indice con `fonti: []` e `records: []`. */
  function costruisciIndice(sources, opts) {
    var o = opts && typeof opts === 'object' ? opts : {};
    var diagnostica = [], copie = [];
    (Array.isArray(sources) ? sources : []).forEach(function (f, i) {
      var c = copiaFonte(f);
      if (c) copie.push(c); else diagnostica.push({ code: 'fonte_non_valida', posizione: i });
    });
    var snap = LS.snapshot({ db: { nodes: [], links: [] }, sources: copie });
    var records = snap.records.filter(function (r) { return r.origin === 'original' || r.origin === 'reference'; });
    var fonti = copie.map(function (c) {
      var suoi = records.filter(function (r) { return r.sourceId === c.sourceId; });
      return {
        sourceId: c.sourceId,
        title: suoi.length ? suoi[0].title : titoloFonte(c),
        sourceRevision: suoi.length ? suoi[0].sourceRevision : '',
        pdfHash: String(c.pdfHash || c.hash || ''),
        pagine: suoi.length,
        generi: contaGeneri(pagineFonte(c))
      };
    });
    return {
      schema: SCHEMA_INDICE,
      creato: typeof o.adesso === 'string' && o.adesso ? o.adesso : new Date().toISOString(),
      fonti: fonti,
      records: records,
      diagnostica: diagnostica.concat(snap.diagnostics || [])
    };
  }

  /* La firma di un indice: `sourceId:sourceRevision` di ogni fonte, in ordine
     alfabetico — l'ordine delle fonti non conta, il loro contenuto sì. */
  function firmaFonti(fonti) {
    return (Array.isArray(fonti) ? fonti : []).map(function (f) {
      return String(f && f.sourceId) + ':' + String(f && f.sourceRevision);
    }).sort().join('\n');
  }

  /* Stantio = da rifare. Non è un oggetto, non ha lo schema di qui, non ha le
     liste che il lettore pretende, o le sue fonti non sono più quelle che
     `costruisciIndice` ricaverebbe adesso dalle stesse `sources`. */
  function indiceStantio(indice, sources) {
    if (!indice || typeof indice !== 'object') return true;
    if (indice.schema !== SCHEMA_INDICE) return true;
    if (!Array.isArray(indice.fonti) || !Array.isArray(indice.records)) return true;
    return firmaFonti(indice.fonti) !== firmaFonti(costruisciIndice(sources).fonti);
  }

  return { tipizza: tipizza, costruisciPacchetto: costruisciPacchetto, formattaPerPrompt: formattaPerPrompt, costruisciIndice: costruisciIndice, indiceStantio: indiceStantio };
}));
