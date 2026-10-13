// ══════════════════════════════════════════════════════════════════════════
// MappAI — Deepen Core (P1 residuo dalla fonte + P2 verdetto anti-parafrasi)
// ══════════════════════════════════════════════════════════════════════════
//
// Logica PURA (zero AI, zero appState) a supporto della Fase 3.7 "deepening
// selettivo" (mappai-generation-support.js:executeDeepeningPass).
//
// Motivazione (audit 20/7/26 su mm_elvezia + mm_la_carta): il deepening
// vecchio si attivava sulla PROFONDITÀ mancante di un ramo e riceveva come
// materiale la SOLA desc del nodo padre → ~40% dei nodi finali erano
// parafrasi del padre (id _D<n>, rel 'approfondisce'). Due interventi:
//
//  P1 — RESIDUO: il materiale per approfondire una foglia non è più la sua
//       desc (che genera parafrasi per costruzione) ma le FRASI DELLA FONTE
//       che (a) parlano del tema della foglia e (b) portano informazione NON
//       già presente nella desc. Se non c'è residuo → niente approfondimento.
//       Il contenuto guida la profondità, non viceversa.
//
//  P2 — VERDETTO: rete di sicurezza deterministica DOPO la generazione. Ogni
//       sotto-concetto proposto è confrontato col "già coperto" (desc del
//       padre + fratelli già accettati): se il suo lessico è in gran parte
//       contenuto lì (containment alto) o porta troppe poche parole nuove,
//       viene SCARTATO (era già nel padre → nessuna perdita). Cattura anche
//       i cluster di fratelli quasi-identici (es. la battaglia raccontata 6
//       volte) perché il covered cresce coi fratelli accettati.
//
// Tokenizzazione/stemming: riusa MappAIDescFidelity (contentWords +
// buildSourceIndex, match esatto o per radice a 6 char per le flessioni
// italiane). Fallback interno equivalente se il modulo non è caricato, così
// il core resta testabile in isolamento. Test: tests/deepen-core.test.js
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./mappai-desc-fidelity.js'));
    } else {
        root.MappAIDeepenCore = factory(root.MappAIDescFidelity);
    }
}(typeof self !== 'undefined' ? self : this, function (DescFidelity) {
    'use strict';

    // ── Soglie (override via opts in ogni funzione pubblica) ────────────────
    const DEFAULTS = {
        // P1 — selezione delle frasi-residuo
        relMin: 0.12,        // frazione min di parole della frase in comune col padre (on-topic)
        minNewWords: 3,      // parole-contenuto NUOVE min perché una frase sia residuo
        maxSentences: 10,    // top-N frasi residue restituite (cap materiale)
        minSentenceWords: 4, // frasi più corte scartate (rumore)
        maxSentenceChars: 320, // frasi mostruose troncate (tabelle, liste incollate)
        // P2 — verdetto anti-parafrasi
        maxContainment: 0.60, // se ≥ questa quota del figlio è già nel coperto → parafrasi
        minNewChildWords: 3,  // parole-contenuto NUOVE min perché un figlio sia legittimo
        // dedup fra frasi residue selezionate
        sentenceDupContainment: 0.80,
        // P1-bis — un assorbitore (nodo non approfondibile) uccide una frase che
        // ha ancora novità SOLO se la reclama con pertinenza forte (è davvero il
        // suo tema); sotto questa soglia la vittoria è "di superficie" e la
        // frase ripiega sulla migliore foglia approfondibile.
        absorberClaimMin: 0.5
    };

    const STEM_LEN = (DescFidelity && DescFidelity.STEM_LEN) || 6;

    // ── Tokenizzazione (delega a DescFidelity, fallback interno equivalente) ─
    const _FALLBACK_STOP = new Set([
        'della', 'delle', 'dello', 'degli', 'alla', 'alle', 'agli', 'allo',
        'dalla', 'dalle', 'nella', 'nelle', 'negli', 'nello', 'sulla',
        'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'come',
        'dove', 'quando', 'perche', 'anche', 'ancora', 'dopo', 'prima',
        'senza', 'sopra', 'sotto', 'verso', 'ogni', 'tutto', 'tutta', 'tutti',
        'tutte', 'loro', 'sono', 'erano', 'essere', 'stato', 'stata', 'aveva',
        'hanno', 'viene', 'veniva', 'vengono', 'venne', 'quindi', 'inoltre',
        'infatti', 'invece', 'mentre', 'durante', 'tramite', 'attraverso',
        'that', 'this', 'these', 'those', 'with', 'from', 'were', 'been',
        'have', 'their', 'which', 'would', 'could', 'should', 'about'
    ]);
    function _fallbackWords(text) {
        return String(text || '')
            .toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[’´`]/g, "'")
            .split(/[^a-z0-9]+/)
            .filter(w => w && !_FALLBACK_STOP.has(w) && (/\d/.test(w) ? w.length >= 2 : w.length >= 4));
    }
    function contentWords(text) {
        return (DescFidelity && DescFidelity.contentWords)
            ? DescFidelity.contentWords(text)
            : _fallbackWords(text);
    }

    // Indice del "coperto": Set di parole esatte + Set di radici a STEM_LEN.
    function buildCoverageIndex(text) {
        if (DescFidelity && DescFidelity.buildSourceIndex) return DescFidelity.buildSourceIndex(text);
        const words = new Set(), stems = new Set();
        for (const w of _fallbackWords(text)) {
            words.add(w);
            if (w.length >= STEM_LEN) stems.add(w.slice(0, STEM_LEN));
        }
        return { words, stems };
    }
    // Una parola è "coperta" se esatta o con la stessa radice nel coperto.
    function _isCovered(w, idx) {
        if (idx.words.has(w)) return true;
        return w.length >= STEM_LEN && idx.stems.has(w.slice(0, STEM_LEN));
    }

    // Confronto lessicale di un testo contro un indice-coperto.
    // → { total, covered, newWords: [uniche non coperte], containment: 0..1 }
    function lexicalOverlap(text, coverageIndexOrText) {
        const idx = (coverageIndexOrText && coverageIndexOrText.words instanceof Set)
            ? coverageIndexOrText : buildCoverageIndex(coverageIndexOrText);
        const ws = contentWords(text);
        if (!ws.length) return { total: 0, covered: 0, newWords: [], containment: 0 };
        let covered = 0;
        const seenNew = new Set(), newWords = [];
        for (const w of ws) {
            if (_isCovered(w, idx)) covered++;
            else if (!seenNew.has(w)) { seenNew.add(w); newWords.push(w); }
        }
        return { total: ws.length, covered, newWords, containment: covered / ws.length };
    }

    // ── Frasi ───────────────────────────────────────────────────────────────
    // V1, tenuta com'era (packet 0030): spezza dopo OGNI [.!?;:] seguito da uno
    // spazio. Resta esportata per confronto e per le misure sugli id salvati.
    // ⚠️ Il `replace(/\s+/g,' ')` viene prima dello split, quindi l'alternativa
    // `\n+` non scatta mai: un a-capo vale uno spazio. La V2 lo conserva, perché
    // gli id delle evidenze (hash di fonte, pagina e testo) dipendono dal confine
    // delle frasi, e un confine nuovo su ogni a-capo li cambierebbe.
    function splitSentencesV1(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .split(/(?<=[.!?;:])\s+|\n+/)
            .map(s => s.trim())
            .filter(Boolean);
    }

    /* V2 (packet 0030, 26/9/2026): le frasi si spezzano dove finisce davvero una
       frase. La V1 spezzava dopo ogni punto e sbagliava 16 casi su 20 di italiano
       realistico («Fig. 1», «p. 12», «G. Guisan», «1. settembre», «a.C.»…): la
       didascalia «Fig. 1 Il circuito…» diventava «Fig.» + «1 Il circuito…», e la
       coda passava ogni filtro come una frase qualunque.
       La V2 TOGLIE soltanto confini alla V1, non ne aggiunge mai: un testo senza
       abbreviazioni dà lo stesso risultato, e una frase che la V1 teneva intera
       resta identica (quindi anche il suo id). `!` `?` `;` `:` spezzano come prima.
       Dopo un punto seguito da spazio NON si spezza se:
         1. la parola prima è in ABBR_SEMPRE ed è scritta minuscola («es.», «cfr.»,
            «ca.», «vs.»; «Es.» e «Cfr.» anche in testa): «Ca» è il calcio e «VS»
            il Vallese, e lì la frase finisce;
         2. è in ABBR_NUMERO («Fig.», «p.», «art.», «pag.»…) e segue una cifra o un
            numero romano — «pag.» davanti a una maiuscola è l'intestazione «…pag.
            Il contenuto…», e lì si spezza; dopo «p.» e «n.», abbreviazioni di una
            lettera, il romano deve averne almeno due («p. XII»), perché «tipo p. I
            portatori» è l'articolo «I»;
         3. è in ABBR_TITOLO («Sig.», «Dott.», «Gen.»…) e segue una maiuscola;
         4. è una sigla puntata («a.C.», «U.S.A.», «N.B.», «S.p.A.») e la frase
            non ricomincia: segue una minuscola, o la sigla è una di SIGLA_SEMPRE
            («N.B. Il multimetro»), o — per «a.C.» e «d.C.» davanti a un nome — la
            data sta in TESTA alla frase: la frase comincia con una preposizione
            di tempo o con una cifra (TESTA_DATA: «Nel 44 a.C. Cesare», «Il 15
            marzo del 44 a.C. Cesare», «753 a.C. Fondazione») e ha al più 8
            parole prima della sigla. Contare le parole non basta: «Roma nasce
            nel 753 a.C. Romolo…», la frase corta della lingua semplificata, ne
            ha 4 e la data è in coda. Una sigla seguita da una parola che apre
            una frase («753 a.C. Secondo la leggenda», «l'O.N.U. Il suo scopo»,
            «l'O.N.U. Quale…?») chiude la frase; e così, davanti a una
            maiuscola, le sigle che vengono sempre DOPO il loro nome
            (SIGLA_IN_CODA: «4478 m s.l.m. Locarno», «Rossi S.p.A. La ditta»);
         5. è un'iniziale maiuscola latina e segue un nome, non una parola che apre
            una frase («G. Guisan», «S. Gottardo» restano; «formula E. Il team»,
            «vitamina C. È», «in A. Traccia», «in A. Quanto…?» si spezzano). Si spezza anche quando
            la lettera è un'etichetta o un simbolo: dopo una parola di ETICHETTA
            («punto B.», «resistenza R.», «piano B.»), dopo un operatore («R · I.»)
            e se non è latina («ohm Ω.»);
         6. segue una minuscola, tranne un marcatore d'elenco «a.» «b)»
            («1. settembre», «E. coli», «ecc. e altro» restano; «conflitto. a.
            Quale…?» si spezza).
       I punti di sospensione e i vuoti da riempire («.....») spezzano come nella
       V1: la frase che finisce in un vuoto l'àncora la scarta apposta
       (TRONCA_NEL_VUOTO), e incollarla alla seguente la farebbe passare.
       Decimali («3.5») e migliaia («1.200») non hanno spazio dopo il punto: non
       sono mai stati un confine.
       ⚠️ LINEARE. Lo splitter riceve anche il corpus INTERO (deepening,
       enrich-core, ELABORA), sul thread dell'interfaccia: ogni lettura attorno a
       un punto guarda solo la parola prima e quella dopo (`lastIndexOf`,
       `indexOf`), mai il testo da capo. Un `/\S+$/` sul prefisso, la prima
       stesura, costava 71 s su un milione di caratteri. Guardia di tempo in
       tests/split-frasi.test.js. */
    const ABBR_SEMPRE = new Set(['es', 'cfr', 'ca', 'vs']);
    const ABBR_NUMERO = new Set(['fig', 'figg', 'tab', 'tabb', 'tav', 'doc', 'docc', 'all', 'art', 'artt',
        'n', 'nn', 'nr', 'p', 'pp', 'pag', 'pagg', 'cap', 'capp', 'vol', 'voll', 'par', 'sez', 'cod']);
    const ROMANO = /^[IVXLCDM]+(?!\p{L})/u;
    const ROMANO_LUNGO = /^[IVXLCDM]{2,}(?!\p{L})/u;
    const SIGLA = /^(?:\p{L}\.)+\p{L}$/u;
    // Sigle che aprono una nota o un inciso: dopo, la maiuscola non chiude niente.
    const SIGLA_SEMPRE = /^(?:N\.B|P\.S|c\.d|i\.e|e\.g)$/i;
    // Niente parole che in inglese chiudono una frase («so on.», «to ten.», «a card.»).
    const ABBR_TITOLO = new Set(['sig', 'sigg', 'dott', 'dr', 'prof', 'gen', 'col', 'magg', 'ing',
        'avv', 'sen', 'mons', 'ss', 'st', 'mr', 'mrs']);
    // Parole funzionali: dopo un'iniziale maiuscola aprono una frase nuova, non un cognome.
    const PAROLE_FUNZIONALI = new Set(('il lo la i gli le un uno una l ' +
        'di a da in con su per tra fra ' +
        'del dello della dei degli delle dell al allo alla ai agli alle all ' +
        'dal dallo dalla dai dagli dalle dall nel nello nella nei negli nelle nell ' +
        'col coi sul sullo sulla sui sugli sulle sull ' +
        'e ed o ma però poi quindi infatti inoltre anche così se quando mentre dopo prima ' +
        'come perché dove non questo questa questi queste quello quella quelli quelle quel ' +
        'quest quell ciò esso essa essi esse egli ella lui lei loro ci si ne ' +
        'the an of on at to for from by with and but or this that these those it he she they we')
        .split(' '));
    // Altre parole che, maiuscole dopo un'iniziale o una sigla, aprono una frase
    // nuova: avverbi e quantificatori di testa, gli interrogativi e gli
    // imperativi delle consegne.
    // Gli INTERROGATIVI contano più di tutto: se la frase che segue è una
    // domanda, la fusione finisce con «?» e l'àncora la scarta intera, frase
    // buona compresa («rettangolo in A. Quanto misura…?», «morsetto B. Che cosa
    // succede…?», «s.l.m. Quale vetta…?»). Non possono essere un cognome. Le
    // forme elise («Cos'è», «Com'è», «Dov'è», «Quand'è») arrivano qui tronche
    // all'apostrofo: «cos», «com», «dov», «quand».
    // ⚠️ Gli imperativi NON sono l'elenco delle consegne (quello vive, in due
    // copie divergenti, nella regola 2 di mappai-evidence-core.js e in
    // ESERCIZIO di mappai-anchor-core.js, e va unificato con Giacomo): qui
    // servono solo a dire «dopo "in A." comincia un'altra frase», e sono
    // l'unione delle due più i verbi di geometria e fisica delle schede.
    // Un elenco resta un elenco: una parola che non c'è («Watt è…», «Dato il
    // triangolo…») dopo un'iniziale viene letta come un cognome.
    const APRE_FRASE = new Set(('è ad ogni ognuno tutti tutto tutte altri altre alcuni alcune molti molte ' +
        'durante secondo oggi ora qui successivamente infine tuttavia pertanto dunque allora invece grazie ' +
        'senza verso contro oltre sotto sopra entrambi nessuno nessun qualche ' +
        'suo sua suoi sue tale tali pochi poche ciascun ciascuno ciascuna ' +
        'nonostante poiché siccome già solo spesso sempre anzi cioè ' +
        'chi che cosa quale quali qual quanto quanta quanti quante cos com dov quand ' +
        'traccia misura calcola disegna osserva scrivi leggi collega completa indica spiega descrivi rispondi ' +
        'sottolinea elenca confronta riordina esamina ricopia inserisci sviluppa verifica trova determina dimostra ' +
        'costruisci chiudi apri unisci considera sapendo sia siano rappresenta ricava risolvi esprimi applica ' +
        'usa utilizza colora segna congiungi prolunga motiva giustifica cerca')
        .split(' '));
    // Parole dopo cui una lettera maiuscola è un'etichetta («il punto B.», «la
    // resistenza R.», «il piano B.»), non l'iniziale di un nome.
    const ETICHETTA = new Set(('punto vertice lato segmento retta angolo vitamina tipo gruppo classe piano ' +
        'lettera fase serie allegato documento figura carica corrente resistenza simbolo insieme zona settore')
        .split(' '));
    const OPERATORE = /^[=·×+\-−/<>≤≥]$/;
    const APERTURA = /^[«"'“‘(\[]+/;
    // Sigle che vengono sempre DOPO il loro nome («4478 m s.l.m.», «Rossi
    // S.p.A.»): davanti a una maiuscola la frase è finita.
    const SIGLA_IN_CODA = /^(?:s\.l\.m|S\.p\.A|S\.A|S\.r\.l)$/;
    // Come comincia una frase con la data in testa: una preposizione di tempo
    // («Nel», «Nella primavera del», «Verso il», «Dopo il», «Nell'anno»…) o una
    // cifra («753 a.C.», «Il 15 marzo del 44 a.C.», «L'8 marzo…»). La parola
    // deve finire lì: «Tra» sì, «Traiano» no; «Fra» sì, «Francesco» no.
    const TESTA_DATA = new RegExp('^(?:(?:nel|nello|nella|nei|negli|nelle|dal|dallo|dalla|dai|dagli|dalle|' +
        'verso|intorno|attorno|entro|fino|tra|fra|sin|già|circa|durante|dopo|prima)(?!\\p{L})|' +
        '(?:nell|dall)[\'’]|ca\\.|\\d|(?:il|l[\'’])\\s*\\d)', 'iu');

    // La frase in corso, da `inizio` a `fino`, è una data in testa: comincia
    // come TESTA_DATA e ha al più 8 parole. Legge al più 200 caratteri.
    function _dataInTesta(s, inizio, fino) {
        if (fino - inizio > 200) return false;
        const t = s.slice(inizio, fino).trim().replace(APERTURA, '');
        return TESTA_DATA.test(t) && t.split(' ').length <= 8;
    }

    // `s` ha gli spazi già compressi in uno solo (' ' è l'unico spazio rimasto);
    // s[p] è lo spazio, s[p-1] la punteggiatura; `inizio` è dove comincia la
    // frase in corso. Ogni lettura resta attorno a `p`: vedi «LINEARE» sopra.
    function _confineVero(s, p, inizio) {
        if (s[p - 1] !== '.') return true;                        // ! ? ; : come la V1
        if (s[p - 2] === '.') return true;                        // «...» «.....»: come la V1
        const da = s.lastIndexOf(' ', p - 2) + 1;                 // dove comincia la parola prima del punto
        const prima = s.slice(da, p - 1).replace(APERTURA, '');
        const parola = prima.split(/['’]/).pop();                 // «dell'art» → «art»
        const wOrig = parola.split('.').pop();                    // «p.es» → «es»
        const w = wOrig.toLowerCase();
        const fine = s.indexOf(' ', p + 1);
        const dopo = s.slice(p + 1, fine < 0 ? s.length : fine).replace(APERTURA, '');
        if (!dopo) return true;
        const nome = dopo.split(/['’]/)[0].replace(/[^\p{L}]+$/u, '').toLowerCase();
        const apre = PAROLE_FUNZIONALI.has(nome) || APRE_FRASE.has(nome);
        if (ABBR_SEMPRE.has(w) && (/^\p{Ll}+$/u.test(wOrig) || /^(?:Es|Cfr)$/.test(wOrig))) return false;
        if (ABBR_NUMERO.has(w) && (/^\d/.test(dopo) || (w.length > 1 ? ROMANO : ROMANO_LUNGO).test(dopo))) return false;
        if (ABBR_TITOLO.has(w) && /^\p{Lu}/u.test(dopo)) return false;
        if (SIGLA.test(parola)) {                                 // sigla puntata
            if (SIGLA_SEMPRE.test(parola) || /^\p{Ll}/u.test(dopo)) return false;
            if (apre) return true;                                // «a.C. Secondo», «O.N.U. Quale»
            if (/^[ad]\.C$/.test(parola)) return !_dataInTesta(s, inizio, da);   // «Nel 476 d.C. Odoacre» resta
            if (SIGLA_IN_CODA.test(parola)) return true;          // «s.l.m. Locarno»
            return false;                                         // «Negli U.S.A. Roosevelt»
        }
        if (/^\p{Lu}$/u.test(parola) && /^\p{Lu}/u.test(dopo)) {
            if (!/^\p{Script=Latin}$/u.test(parola)) return true;  // «ohm Ω.»: un simbolo
            const davanti = da > 0
                ? s.slice(s.lastIndexOf(' ', da - 2) + 1, da - 1).replace(APERTURA, '').split(/['’]/).pop().toLowerCase()
                : '';
            if (ETICHETTA.has(davanti) || OPERATORE.test(davanti)) return true;   // «punto B.», «R · I.»
            if (!apre) return false;                              // iniziale di un nome
        }
        if (/^\p{Ll}/u.test(dopo) && !/^\p{Ll}[.)]$/u.test(dopo)) return false;
        return true;
    }

    function splitSentences(text) {
        const s = String(text || '').replace(/\s+/g, ' ');
        const out = [];
        const re = /[.!?;:] /g;
        let da = 0, m;
        while ((m = re.exec(s)) !== null) {
            const p = m.index + 1;
            if (!_confineVero(s, p, da)) continue;
            out.push(s.slice(da, p));
            da = p + 1;
        }
        out.push(s.slice(da));
        return out.map(x => x.trim()).filter(Boolean);
    }

    // Similarità di Jaccard sui token-contenuto di due testi (0..1).
    function jaccardSim(textA, textB) {
        const a = new Set(contentWords(textA)), b = new Set(contentWords(textB));
        if (!a.size || !b.size) return 0;
        let inter = 0;
        for (const w of a) if (b.has(w)) inter++;
        return inter / (a.size + b.size - inter);
    }

    // ── P1 — RESIDUO ─────────────────────────────────────────────────────────
    // Frasi della fonte che parlano del tema del padre MA aggiungono lessico
    // non ancora nella sua desc. Ordinate per quantità di novità, deduplicate
    // fra loro. `parentText` = label + desc del nodo padre; `corpus` = fonte.
    function residueSentences(parentText, corpus, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        const parentIdx = buildCoverageIndex(parentText);
        const parentWords = new Set(contentWords(parentText));
        if (!parentWords.size) return [];

        const picked = [];              // { text, novelty, words:Set }
        for (let raw of splitSentences(corpus)) {
            if (raw.length > o.maxSentenceChars) raw = raw.slice(0, o.maxSentenceChars);
            const ws = contentWords(raw);
            if (ws.length < o.minSentenceWords) continue;
            // rilevanza: quota di parole della frase che stanno nel tema del padre
            let onTopic = 0;
            const newSet = new Set();
            for (const w of ws) {
                if (_isCovered(w, parentIdx)) onTopic++;
                else newSet.add(w);
            }
            const relevance = onTopic / ws.length;
            if (relevance < o.relMin) continue;         // off-topic
            if (newSet.size < o.minNewWords) continue;   // nessuna info nuova → è la desc del padre
            // dedup fra frasi già scelte (evita di ripetere lo stesso residuo)
            const dup = picked.some(p => {
                const inter = [...newSet].filter(w => p.words.has(w)).length;
                return inter / newSet.size >= o.sentenceDupContainment;
            });
            if (dup) continue;
            picked.push({ text: raw, novelty: newSet.size, words: newSet });
        }
        picked.sort((a, b) => b.novelty - a.novelty);
        return picked.slice(0, o.maxSentences).map(p => p.text);
    }

    // Materiale-residuo pronto per il prompt (stringa), '' se non c'è residuo.
    function buildResidueMaterial(parentText, corpus, opts) {
        return residueSentences(parentText, corpus, opts).join(' ');
    }

    // ── P1-bis — ASSEGNAZIONE GLOBALE frase→foglia ──────────────────────────
    // Difetto osservato (mappa "Storia della Carta" 2A): ogni foglia pescava il
    // residuo in modo indipendente → la stessa frase della fonte (es. i magli
    // idraulici di Fabriano) veniva depositata come figlio in 4 rami diversi,
    // anche sotto padri fuori tema ("Produzione Papiro") dove la pertinenza
    // lessicale di superficie bastava a passare il gate.
    // Qui ogni frase del corpus è assegnata AL SOLO competitor con pertinenza
    // massima (argmax): niente doppi depositi, e la frase finisce dove è
    // davvero a tema. competitors: [{ id, parentText, eligible }] — DEVE
    // includere anche i nodi NON approfondibili (eligible:false = assorbitori).
    // Se l'argmax è un assorbitore, la frase viene UCCISA solo in due casi:
    //  - è già coperta lì (novità < minNewWords → davvero ridondante), oppure
    //  - l'assorbitore la reclama con pertinenza forte (≥ absorberClaimMin: la
    //    frase è chiaramente il SUO tema, depositarla altrove la collocherebbe
    //    male — es. i magli di Fabriano sotto "Produzione Papiro").
    // Altrimenti la vittoria è "di superficie" (tipico: il padre a desc ricca
    // out-copre la propria foglia specifica) e la frase ripiega sulla migliore
    // foglia approfondibile — senza questo ripiego il deepening perderebbe
    // recall proprio dove le desc dei padri sono più curate (finding review
    // 21/7/26). A parità di pertinenza un eligible batte sempre un assorbitore.
    // → Map<id, material:string> (solo competitor eligible con residuo).
    function assignResidues(competitors, corpus, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        const prepared = (competitors || []).map(c => ({
            id: c.id,
            eligible: c.eligible !== false,
            idx: buildCoverageIndex(c.parentText),
            hasWords: contentWords(c.parentText).length > 0
        })).filter(c => c.hasWords);
        const out = new Map();
        if (!prepared.length) return out;

        const perLeaf = new Map();  // id → [{text, novelty, words}] (solo eligible)
        prepared.forEach(c => { if (c.eligible) perLeaf.set(c.id, []); });

        // ordine: pertinenza, poi eligible batte assorbitore, poi novità
        const beats = (a, b) => !b || a.relevance > b.relevance ||
            (a.relevance === b.relevance && (
                (a.comp.eligible ? 1 : 0) > (b.comp.eligible ? 1 : 0) ||
                ((a.comp.eligible ? 1 : 0) === (b.comp.eligible ? 1 : 0) && a.newSet.size > b.newSet.size)));

        for (let raw of splitSentences(corpus)) {
            if (raw.length > o.maxSentenceChars) raw = raw.slice(0, o.maxSentenceChars);
            const ws = contentWords(raw);
            if (ws.length < o.minSentenceWords) continue;
            let best = null, bestEligible = null;
            for (const comp of prepared) {
                let onTopic = 0;
                const newSet = new Set();
                for (const w of ws) {
                    if (_isCovered(w, comp.idx)) onTopic++;
                    else newSet.add(w);
                }
                const relevance = onTopic / ws.length;
                if (relevance < o.relMin) continue;
                // per DEPOSITARE serve novità; un assorbitore compete comunque
                if (comp.eligible && newSet.size < o.minNewWords) continue;
                const cand = { comp, relevance, newSet };
                if (beats(cand, best)) best = cand;
                if (comp.eligible && beats(cand, bestEligible)) bestEligible = cand;
            }
            let winner = null;
            if (best) {
                if (best.comp.eligible) {
                    winner = best;
                } else if (best.newSet.size < o.minNewWords || best.relevance >= o.absorberClaimMin) {
                    winner = null;           // assorbita davvero: coperta o chiaramente sua
                } else {
                    winner = bestEligible;   // vittoria di superficie → ripiega (può essere null)
                }
            }
            if (winner) {
                perLeaf.get(winner.comp.id).push({ text: raw, novelty: winner.newSet.size, words: winner.newSet });
            }
        }

        // per foglia: dedup fra frasi assegnate + ordinamento per novità + cap
        for (const [id, picked] of perLeaf) {
            const kept = [];
            picked.sort((a, b) => b.novelty - a.novelty);
            for (const p of picked) {
                const dup = kept.some(k => {
                    const inter = [...p.words].filter(w => k.words.has(w)).length;
                    return inter / p.words.size >= o.sentenceDupContainment;
                });
                if (!dup) kept.push(p);
            }
            const material = kept.slice(0, o.maxSentences).map(k => k.text).join(' ');
            if (material) out.set(id, material);
        }
        return out;
    }

    // ── P3 — GATE ANTI-DUPLICATO GLOBALE ────────────────────────────────────
    // Un candidato è quasi-duplicato di un nodo ESISTENTE (qualsiasi ramo) se
    // Jaccard alto sui token-contenuto O se il suo lessico è quasi tutto già
    // contenuto in quel nodo. Cattura i gemelli cross-ramo ("Fili metallici
    // Fabriano" ↔ "Fili Metallici nei Setacci") che il verdetto padre+fratelli
    // non può vedere. `others` = array di stringhe (label+desc dei nodi).
    // → indice del primo duplicato in others, o -1.
    function isNearDuplicate(text, others, opts) {
        const o = Object.assign({ dupJaccard: 0.55, dupContainment: 0.75 }, opts);
        const aList = contentWords(text);   // tokenizza il candidato UNA volta
        if (!aList.length) return -1;
        const aSet = new Set(aList);
        for (let i = 0; i < (others || []).length; i++) {
            const other = others[i];
            if (!other) continue;
            const idx = buildCoverageIndex(other);
            let inter = 0, covered = 0;
            for (const w of aSet) if (idx.words.has(w)) inter++;
            for (const w of aList) if (_isCovered(w, idx)) covered++;
            if (inter / (aSet.size + idx.words.size - inter) >= o.dupJaccard) return i;
            if (covered / aList.length >= o.dupContainment) return i;
        }
        return -1;
    }

    // ── P2 — VERDETTO ANTI-PARAFRASI ─────────────────────────────────────────
    // Un sotto-concetto è legittimo se NON è in gran parte già nel coperto e
    // porta abbastanza parole nuove. `coveredText` = desc del padre + desc dei
    // fratelli già accettati.
    // → { accept, containment, newWordCount, reason }
    function paraphraseVerdict(childText, coveredText, opts) {
        const o = Object.assign({}, DEFAULTS, opts);
        const ov = lexicalOverlap(childText, coveredText);
        if (ov.total === 0) {
            return { accept: false, containment: 0, newWordCount: 0, reason: 'vuoto' };
        }
        if (ov.containment >= o.maxContainment) {
            return { accept: false, containment: ov.containment, newWordCount: ov.newWords.length, reason: 'parafrasi' };
        }
        if (ov.newWords.length < o.minNewChildWords) {
            return { accept: false, containment: ov.containment, newWordCount: ov.newWords.length, reason: 'poco-nuovo' };
        }
        return { accept: true, containment: ov.containment, newWordCount: ov.newWords.length, reason: 'ok' };
    }

    // Filtro incrementale di una lista di sotto-concetti proposti: il coperto
    // cresce coi figli accettati → i duplicati fra fratelli cadono uno per uno.
    // children: [{ label, desc, ... }]. Ritorna { accepted:[...], rejected:[...] }.
    function filterProposedChildren(children, parentCoveredText, opts) {
        const accepted = [], rejected = [];
        let covered = String(parentCoveredText || '');
        for (const c of (children || [])) {
            const text = ((c.label || '') + ' ' + (c.desc || '')).trim();
            const v = paraphraseVerdict(text, covered, opts);
            if (v.accept) {
                accepted.push(Object.assign({}, c, { _verdict: v }));
                covered += '\n' + (c.desc || c.label || '');
            } else {
                rejected.push(Object.assign({}, c, { _verdict: v }));
            }
        }
        return { accepted, rejected };
    }

    // ── TETTO DI PROFONDITÀ — ripiegamento deterministico ───────────────────
    // Rende lo slider "Genera fino a L{max}" una GARANZIA nei dati, non un
    // filtro di vista. Ogni nodo più profondo di maxLevel viene RIMOSSO e il suo
    // contenuto RIPIEGATO nella desc dell'antenato-al-tetto (il discendente di
    // maxLevel sulla sua catena), ma solo le frasi che aggiungono lessico nuovo
    // (anti-parafrasi, riuso di lexicalOverlap) e finché la desc resta leggibile
    // (tetto parole per BES/DSA). I cross-link che toccano un nodo ripiegato
    // vengono ri-puntati all'antenato-al-tetto (self-loop e duplicati scartati);
    // i link d'albero interni al sottoalbero ripiegato spariscono.
    //
    // Profondità = topologica (BFS da ROOT sui link non-cross), non il campo
    // `level` (che può essere stale prima del sanitizer). Puro: opera su copie
    // e ritorna il nuovo grafo + un report.
    //
    // nodes: [{id,label,desc,content,...}], links: [{source,target,rel,isCross}]
    // → { nodes, links, removed:[id], foldedInto:{capId:[srcId]}, report }
    function foldBeyondDepth(nodes, links, maxLevel, opts) {
        const o = Object.assign({ maxDescWords: 140, rootId: 'ROOT' }, opts);
        const max = parseInt(maxLevel);
        const eid = x => (x && typeof x === 'object') ? x.id : x;
        const N = (nodes || []).map(n => Object.assign({}, n));       // copie
        const byId = {}; N.forEach(n => { byId[n.id] = n; });
        const L = (links || []).map(l => ({ source: eid(l.source), target: eid(l.target), rel: l.rel, isCross: !!l.isCross }));
        const report = { removed: [], foldedInto: {}, appended: 0, skippedDup: 0 };
        if (!(max >= 1) || !byId[o.rootId]) return { nodes: N, links: L, removed: [], foldedInto: {}, report };

        // BFS profondità + genitore d'albero
        const children = {}, parent = {};
        L.forEach(l => { if (l.isCross || l.isBridge) return; (children[l.source] = children[l.source] || []).push(l.target); if (parent[l.target] === undefined) parent[l.target] = l.source; });
        const depth = {}; depth[o.rootId] = 0;
        let q = [o.rootId];
        while (q.length) { const nx = []; for (const id of q) for (const c of (children[id] || [])) if (depth[c] === undefined && byId[c]) { depth[c] = depth[id] + 1; nx.push(c); } q = nx; }

        // antenato-al-tetto per un nodo profondo: risali finché depth == max
        const capOf = (id) => {
            let cur = id, guard = 0;
            while (cur !== undefined && depth[cur] > max && guard < 64) { cur = parent[cur]; guard++; }
            return (cur !== undefined && depth[cur] === max) ? cur : null;
        };

        // gruppi di ripiegamento: cap → discendenti (dal meno profondo)
        const groups = {};
        N.forEach(n => {
            const d = depth[n.id];
            if (d === undefined || d <= max) return;   // irraggiungibile o entro il tetto
            const cap = capOf(n.id);
            if (!cap) return;                            // niente antenato valido → lasciato (raro)
            (groups[cap] = groups[cap] || []).push(n.id);
        });

        const wordCount = s => (String(s || '').trim().match(/\S+/g) || []).length;
        const foldedSet = new Set();

        Object.keys(groups).forEach(capId => {
            const cap = byId[capId];
            const ids = groups[capId].sort((a, b) => (depth[a] - depth[b]));
            let covered = (cap.desc || cap.content || '');
            ids.forEach(id => {
                foldedSet.add(id);
                report.removed.push(id);
                (report.foldedInto[capId] = report.foldedInto[capId] || []).push(id);
                if (wordCount(cap.desc) >= o.maxDescWords) return;   // desc già piena → assorbi senza scrivere
                const src = byId[id];
                const piece = (src.desc || src.content || '').trim();
                if (!piece) return;
                // ripiega solo se aggiunge lessico nuovo (no parafrasi dell'antenato)
                if (isNearDuplicate(piece, [covered], { dupJaccard: 0.6, dupContainment: 0.7 }) >= 0) { report.skippedDup++; return; }
                cap.desc = ((cap.desc || '') + ' ' + piece).trim();
                covered = cap.desc;
                report.appended++;
            });
        });

        // rimuovi i nodi ripiegati
        const outNodes = N.filter(n => !foldedSet.has(n.id));

        // ricablaggio link: droppa quelli interni al sottoalbero ripiegato;
        // ri-punta i cross-link con UN estremo ripiegato verso il suo cap
        const seen = new Set(), outLinks = [];
        L.forEach(l => {
            let s = l.source, t = l.target;
            const sF = foldedSet.has(s), tF = foldedSet.has(t);
            if (sF && tF) return;                        // interno al sottoalbero → via
            if (sF) s = capOf(l.source);
            if (tF) t = capOf(l.target);
            if (!s || !t || s === t) return;             // self-loop dopo il ricablaggio
            if (!outNodes.some(n => n.id === s) || !outNodes.some(n => n.id === t)) return;
            const key = s + '→' + t + '|' + (l.isCross ? 'x' : 'h');
            if (seen.has(key)) return; seen.add(key);
            outLinks.push({ source: s, target: t, rel: l.rel, isCross: l.isCross });
        });

        return { nodes: outNodes, links: outLinks, removed: report.removed, foldedInto: report.foldedInto, report };
    }

    return {
        DEFAULTS,
        contentWords,
        buildCoverageIndex,
        lexicalOverlap,
        jaccardSim,
        splitSentences,
        splitSentencesV1,
        residueSentences,
        buildResidueMaterial,
        assignResidues,
        paraphraseVerdict,
        filterProposedChildren,
        isNearDuplicate,
        foldBeyondDepth
    };
}));
