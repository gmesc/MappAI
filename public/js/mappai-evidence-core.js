/*
 * mappai-evidence-core.js — le evidenze: la frase VERA della fonte, con documento
 * e pagina, che un generatore riceve e cita per identificatore (ADR 0002,
 * invariante 22). Passo 1 del piano Evidence (docs/tasks/0001-evidence-core.md).
 *
 * Tre funzioni, tutte pure (niente DOM, IPC, modelli, timer):
 *   · tipizza(unita)            → la stessa unità con un `genere`;
 *   · costruisciPacchetto(...)  → da una query, le unità che un generatore leggerà,
 *                                 con tetto e scarti contati;
 *   · formattaPerPrompt(p)      → il blocco di testo con gli id `[[ev-…]]`.
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

  return { tipizza: tipizza, costruisciPacchetto: costruisciPacchetto, formattaPerPrompt: formattaPerPrompt };
}));
