'use strict';
/*
 * mappai-causal-core.js — logica PURA della «Catena dei perché» (UMD, testabile in Node).
 *
 * Estrae nessi causa-effetto da DUE sorgenti complementari:
 *   1. i LINK del grafo il cui verbo `rel` appartiene a una famiglia "di ragionamento"
 *      (trasformazione/dipendenza/sequenza/opposizione) — la familyMap è INIETTATA
 *      (REL_FAMILY_MAP di mappai-relations.js) con un fallback minimo per i test;
 *   2. le DESC dei nodi: connettivi causali/contrastivi a livello di frase.
 *      Pattern CONSERVATIVI: meglio perdere un nesso che estrarne uno sbagliato.
 *
 * Le triple sono normalizzate {cause, effect, conn, family, origin}; i contrasti
 * («invece di») sono type:'contrast' con {a, b}. Raggruppamento per ramo L1
 * (parent-walk sui link gerarchici) + sezione separata per i ponti tra rami.
 *
 * Zero dipendenze, zero DOM: usato da mappai-causal-chains.js (documento
 * stampabile + pagine PDF foglio nodi) e mappai-branch-synthesis.js (scaffold prompt).
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.MappAICausalCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {

    // ── Connettivi nelle desc ───────────────────────────────────────────────
    // dir: 'ce' = left è causa, right è effetto; 'ec' = left è effetto, right è causa.
    // type 'contrast': coppia a/b senza direzione causale.
    // Ordinati per lunghezza decrescente (il match più specifico vince).
    // NB precisione (review 19/7/26):
    // - articoli composti espliciti (della/dello/dei/degli/dell') — mai spezzare dentro la parola;
    // - SOLO forme verbali non ambigue: 'causa'/'porta a' al presente sono anche
    //   SOSTANTIVI ("la causa principale", "la porta a chiave") → tenute fuori;
    // - passivi EN esclusi con lookahead: "caused by" inverte causa/effetto;
    // - 'per questo' consuma anche motivo/ragione/fatto.
    const CONNECTIVES = [
        // — italiano —
        { re: /(?:^|\s)di conseguenza[\s,]+/i, conn: 'di conseguenza', cls: 'adv', dir: 'ce', family: 'trasformazione', lang: 'it' },
        { re: /(?:^|\s)a causa d(?:ell['’]\s*|(?:i|el|ello|ella|elle|ei|egli)\s+)/i, conn: 'a causa di', cls: 'prep', dir: 'ec', family: 'trasformazione', lang: 'it' },
        { re: /(?:^|\s)per questo(?:\s+(?:motivo|ragione|fatto))?[\s,]+/i, conn: 'per questo', cls: 'adv', dir: 'ce', family: 'trasformazione', lang: 'it' },
        { re: /(?:^|\s)grazie a(?:ll['’]\s*|(?:i|l|lla|lle|gli)?\s+)/i, conn: 'grazie a', cls: 'prep', dir: 'ec', family: 'dipendenza', lang: 'it' },
        { re: /(?:^|\s)rese possibile\s+/i, conn: 'rese possibile', cls: 'verb', dir: 'ce', family: 'dipendenza', lang: 'it' },
        { re: /(?:^|\s)rende possibile\s+/i, conn: 'rende possibile', cls: 'verb', dir: 'ce', family: 'dipendenza', lang: 'it' },
        { re: /(?:^|\s)dato che\s+/i, conn: 'dato che', cls: 'conj', dir: 'ec', family: 'trasformazione', lang: 'it' },
        { re: /(?:^|\s)perch[eé]\s+/i, conn: 'perché', cls: 'conj', dir: 'ec', family: 'trasformazione', lang: 'it' },
        { re: /(?:^|\s)poich[eé]\s+/i, conn: 'poiché', cls: 'conj', dir: 'ec', family: 'trasformazione', lang: 'it' },
        { re: /(?:^|\s)quindi[\s,]+/i, conn: 'quindi', cls: 'adv', dir: 'ce', family: 'trasformazione', lang: 'it' },
        { re: /(?:^|\s)perci[oò][\s,]+/i, conn: 'perciò', cls: 'adv', dir: 'ce', family: 'trasformazione', lang: 'it' },
        { re: /(?:^|\s)port(?:ò|arono) a(?:l|lla|lle|i|gli)?\s+/i, conn: 'portò a', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'it' },
        { re: /(?:^|\s)caus(?:ò|arono)\s+/i, conn: 'causò', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'it' },
        { re: /(?:^|\s)provoc(?:ò|arono|a|ano)\s+/i, conn: 'provocò', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'it' },
        // SOLO LATO RISPOSTA (answerOnly): forme al presente ambigue coi SOSTANTIVI
        // («la causa», «la porta a») — mai usate per ESTRARRE dal testo, ma come
        // risposta a un buco-relazione l'ambiguità non esiste: il sinonimo naturale
        // dello studente («causa» per «provocò») va accettato. Verbi dalla famiglia
        // trasformazione di EDGE_FAMILIES (regola 12).
        { re: /(?:^|\s)caus(?:a|ano)\s+/i, conn: 'causa', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'it', answerOnly: true },
        { re: /(?:^|\s)gener(?:a|ano|ò|arono)\s+/i, conn: 'genera', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'it', answerOnly: true },
        { re: /(?:^|\s)produc(?:e|ono)\s+/i, conn: 'produce', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'it', answerOnly: true },
        { re: /(?:^|\s)determin(?:a|ano|ò|arono)\s+/i, conn: 'determina', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'it', answerOnly: true },
        { re: /(?:^|\s)port(?:a|ano) a(?:l|lla|lle|i|gli)?\s+/i, conn: 'porta a', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'it', answerOnly: true },
        { re: /(?:^|\s)causes\s+/i, conn: 'causes', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'en', answerOnly: true },
        { re: /(?:^|\s)permise(?:ro)? (?:di\s+|a(?:l|lla|i|gli)?\s+)?/i, conn: 'permise', cls: 'verb', dir: 'ce', family: 'dipendenza', lang: 'it' },
        { re: /(?:^|\s)permett(?:e|ono) (?:di\s+|a(?:l|lla|i|gli)?\s+)?/i, conn: 'permette', cls: 'verb', dir: 'ce', family: 'dipendenza', lang: 'it' },
        { re: /(?:^|\s)invece d(?:ell['’]\s*|(?:i|el|ello|ella|elle|ei|egli)\s+)/i, conn: 'invece di', cls: 'prep', type: 'contrast', family: 'opposizione', lang: 'it' },
        { re: /(?:^|\s)a differenza d(?:ell['’]\s*|(?:i|el|ello|ella|elle|ei|egli)\s+)/i, conn: 'a differenza di', cls: 'prep', type: 'contrast', family: 'opposizione', lang: 'it' },
        { re: /(?:^|\s)anzich[eé]\s+/i, conn: 'anziché', cls: 'prep', type: 'contrast', family: 'opposizione', lang: 'it' },
        // — inglese —
        { re: /(?:^|\s)as a consequence[\s,]+/i, conn: 'as a consequence', cls: 'adv', dir: 'ce', family: 'trasformazione', lang: 'en' },
        { re: /(?:^|\s)because of\s+/i, conn: 'because of', cls: 'prep', dir: 'ec', family: 'trasformazione', lang: 'en' },
        { re: /(?:^|\s)because\s+/i, conn: 'because', cls: 'conj', dir: 'ec', family: 'trasformazione', lang: 'en' },
        { re: /(?:^|\s)thanks to\s+/i, conn: 'thanks to', cls: 'prep', dir: 'ec', family: 'dipendenza', lang: 'en' },
        { re: /(?:^|\s)due to\s+/i, conn: 'due to', cls: 'prep', dir: 'ec', family: 'trasformazione', lang: 'en' },
        { re: /(?:^|\s)therefore[\s,]+/i, conn: 'therefore', cls: 'adv', dir: 'ce', family: 'trasformazione', lang: 'en' },
        { re: /(?:^|\s)led to\s+/i, conn: 'led to', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'en' },
        { re: /(?:^|\s)leads to\s+/i, conn: 'leads to', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'en' },
        { re: /(?:^|\s)caused\s+(?!by\b)/i, conn: 'caused', cls: 'verb', dir: 'ce', family: 'trasformazione', lang: 'en' },
        { re: /(?:^|\s)enabled\s+(?!by\b)/i, conn: 'enabled', cls: 'verb', dir: 'ce', family: 'dipendenza', lang: 'en' },
        { re: /(?:^|\s)allowed\s+(?!by\b|to\b)/i, conn: 'allowed', cls: 'verb', dir: 'ce', family: 'dipendenza', lang: 'en' },
        { re: /(?:^|\s)instead of\s+/i, conn: 'instead of', cls: 'prep', type: 'contrast', family: 'opposizione', lang: 'en' },
        { re: /(?:^|\s)unlike\s+/i, conn: 'unlike', cls: 'prep', type: 'contrast', family: 'opposizione', lang: 'en' }
    ];

    // Famiglie di link considerate "catena" (le altre — appartenenza, regolazione,
    // analogia — sono gerarchia/contesto, non nessi di ragionamento lineare).
    const CHAIN_FAMILIES = { trasformazione: 1, dipendenza: 1, sequenza: 1, opposizione: 1 };

    // Fallback minimo se REL_FAMILY_MAP non è iniettata (test / degradazione):
    // subset dei keywords di EDGE_FAMILIES, MAI fonte di verità (regola 12).
    const FALLBACK_FAMILY_MAP = {
        'causa': 'trasformazione', 'genera': 'trasformazione', 'produce': 'trasformazione',
        'porta a': 'trasformazione', 'provoca': 'trasformazione', 'determina': 'trasformazione',
        'richiede': 'dipendenza', 'dipende da': 'dipendenza', 'permette': 'dipendenza',
        'precede': 'sequenza', 'segue': 'sequenza', 'deriva da': 'sequenza',
        'si oppone a': 'opposizione', 'contrasta': 'opposizione', 'impedisce': 'opposizione',
        'causes': 'trasformazione', 'requires': 'dipendenza', 'precedes': 'sequenza', 'opposes': 'opposizione'
    };

    const MAX_SIDE_CHARS = 100;   // taglio per lato: righe corte = leggibili (BES/DSA)
    const MIN_SIDE_WORDS = 2;     // lato più corto di così = frammento, scarta
    const MAX_PER_BRANCH = 40;    // cap per ramo (documenti giganti = illeggibili)

    // ── Gruppi di equivalenza dei connettivi (per il cloze buchi-relazione) ──
    // Chiave = direzione + famiglia + CLASSE grammaticale: «poiché»≡«perché»
    // (congiunzioni effetto←causa), ma «quindi» NO (direzione opposta) e «a causa
    // di» NEMMENO (preposizione ≠ congiunzione). FONTE UNICA usata da mappai-cloze.js
    // (grading in-app) e, via connEquivalents precalcolato, dal grading server di
    // MappAI Live (che non può importare questo modulo).
    function _connGroupKey(c) { return (c.type || c.dir) + '|' + c.family + '|' + (c.cls || ''); }

    // Gruppo del connettivo la cui SUPERFICIE è l'intera stringa `s` (match ancorato
    // a inizio E che copre ~tutto: «Perché scoppiò la guerra» NON è un connettivo).
    function connGroup(s) {
        const raw = ' ' + String(s || '').trim() + ' ';
        if (raw.length < 4) return null;
        let best = null, bestLen = 0;
        for (const c of CONNECTIVES) {
            const m = c.re.exec(raw);
            if (!m || m.index > 0) continue;              // (?:^|\s) consuma il pad → inizio a 0
            if (m[0].length < raw.length - 1) continue;   // deve consumare (quasi) tutta la stringa
            if (m[0].length > bestLen) { best = _connGroupKey(c); bestLen = m[0].length; }
        }
        return best;
    }

    // Forme articolate che le REGEX dei connettivi già tollerano (grazie a→grazie
    // agli/alla; a causa di→a causa della/dei…). Servono a rendere la lista `accept`
    // di MappAI Live COMPLETA quanto il match-regex dello Studio attivo (parità di
    // verdetto). Solo IT; le voci EN/anziché/… non flettono → nessuna espansione.
    function _articleForms(surface) {
        const s = String(surface);
        const out = [s];
        if (/ a$/.test(s)) {                         // «grazie a», «portò a»
            const p = s.slice(0, -1);                // "grazie " (spazio incluso)
            ['a', 'al', 'allo', 'alla', 'alle', 'ai', 'agli', "all'"].forEach(x => out.push(p + x));
        } else if (/ di$/.test(s)) {                 // «a causa di», «invece di», «a differenza di»
            const p = s.slice(0, -2);                // "a causa " → + del/della/dei…
            ['di', 'del', 'dello', 'della', 'delle', 'dei', 'degli', "dell'"].forEach(x => out.push(p + x));
        }
        return out;
    }

    // Tutte le superfici accettate per il gruppo di `s` (incluse le voci answerOnly,
    // es. «causa/genera» per «provocò», e le forme articolate). [] se `s` non è un
    // connettivo intero. Deduplicato (case-insensitive sulla stringa esatta).
    function connEquivalents(s) {
        const g = connGroup(s);
        if (!g) return [];
        const seen = {}, out = [];
        for (const c of CONNECTIVES) {
            if (_connGroupKey(c) !== g) continue;
            for (const form of _articleForms(c.conn)) {
                const k = form.toLowerCase();
                if (seen[k]) continue;
                seen[k] = 1; out.push(form);
            }
        }
        return out;
    }

    function _clean(s) {
        return String(s || '')
            .replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function _words(s) { return _clean(s).split(/\s+/).filter(Boolean).length; }

    // Lato "spazzatura": troppo corto, o anafora/copula senza contenuto proprio
    // («Questo avvenne», «È separata») — il referente sta in un'altra frase.
    function _junkSide(s) {
        const w = _words(s);
        if (w < MIN_SIDE_WORDS) return true;
        const cs = _clean(s);
        // NB: niente \b — dopo lettere accentate (È, ciò) il word-boundary JS fallisce
        if (w <= 3 && /^(questo|questa|questi|queste|ciò|esso|essa|essi|esse|lui|lei|tale|tali|this|that|it|they)(\s|$)/i.test(cs)) return true;
        if (w <= 3 && /^(è|era|sono|erano|fu|furono|avvenne|accadde|is|was|are|were)(\s|$)/i.test(cs)) return true;
        // Soggetto ANAFORICO: il lato inizia con un possessivo il cui referente sta
        // FUORI dal lato ("La sua posizione a corte…", "Il loro uso…", "Their spread…")
        // → estratto nella Catena il soggetto (es. Cai Lun) sparisce. Scarta a QUALSIASI
        // lunghezza: meglio perdere un nesso che mostrarne uno senza soggetto (§8-9).
        if (/^(?:(?:la|il|i|le|gli|lo)\s+)?(?:sua|suo|suoi|sue|loro)\s/i.test(cs)) return true;
        if (/^(?:his|her|its|their)\s/i.test(cs)) return true;
        return false;
    }

    // Toglie clitici/articoli/preposizioni penzolanti in coda al lato
    // ("La sua posizione a corte gli" → "La sua posizione a corte").
    function _stripDangling(s) {
        let prev;
        do {
            prev = s;
            s = s.replace(/\s+(gli|le|li|lo|la|l['’]|ci|vi|ne|si|loro|di|a|ad|da|in|con|su|per|tra|fra|e|ed|o|od|the|of|to|and|by|a|an)$/i, '');
        } while (s !== prev);
        return s;
    }

    function _cap(s) {
        s = _stripDangling(_clean(s));
        if (s.length <= MAX_SIDE_CHARS) return s;
        const cut = s.slice(0, MAX_SIDE_CHARS);
        const sp = cut.lastIndexOf(' ');
        return _stripDangling(sp > 50 ? cut.slice(0, sp) : cut) + '…';
    }

    // ── 1. Triple dalle desc ────────────────────────────────────────────────
    // Una tripla al massimo per frase (il primo connettivo che matcha):
    // conservativo per costruzione.
    function extractDescTriples(text, nodeId, nodeLabel) {
        const out = [];
        // Split frasi: solo se dopo il punto inizia una maiuscola (evita di
        // spezzare su abbreviazioni come "105 d.C., si diffuse"); i newline
        // separano sempre (elenchi puntati senza punteggiatura).
        const sentences = String(text || '').split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Þ«"“])|\n+/);
        for (const sent of sentences) {
            for (const c of CONNECTIVES) {
                if (c.answerOnly) continue;   // solo grading cloze, mai estrazione
                // 'X funziona grazie a Y' cannot become 'Y permette X funziona'.
                // ponytail: keep these dependencies in the prose; extracting them needs
                // a grammatical rewrite, beyond this literal, deterministic extractor.
                if (c.dir === 'ec' && c.cls === 'prep' && c.family === 'dipendenza') continue;
                const m = c.re.exec(sent);
                if (!m) continue;
                let left = _clean(sent.slice(0, m.index));
                let right = _clean(sent.slice(m.index + m[0].length)).replace(/[.!?]+$/, '');
                // Connettivo a INIZIO frase ("Invece di X, Y…" / "A causa di Y, X…"):
                // il lato sinistro è vuoto → spezza il destro alla prima virgola.
                // Con dir 'ce' ("Quindi X…") la causa sta nella frase PRECEDENTE:
                // non ricostruibile in modo affidabile → scarta (conservativo).
                let atStart = false;
                if (_words(left) < MIN_SIDE_WORDS) {
                    if (c.dir === 'ce' || !right.includes(',')) break;
                    atStart = true;
                    // "Invece dell'amido, che attirava insetti, gli Italiani…":
                    // i segmenti relativi (che/cui/il quale) appartengono al lato A.
                    const segs = right.split(',');
                    let k = 1;
                    while (k < segs.length - 1 && /^\s*(che|cui|il quale|la quale|i quali|le quali|which|who)\b/i.test(segs[k])) k++;
                    left = _clean(segs.slice(0, k).join(','));
                    right = _clean(segs.slice(k).join(','));
                } else if (c.dir === 'ec' && right.includes(',')) {
                    // 'ec' a metà frase: la CAUSA (right) è di norma un sintagma
                    // breve — tutto ciò che segue la prima virgola è coda della
                    // frase, non causa ("grazie agli Arabi, rivoluzionando…").
                    right = _clean(right.slice(0, right.indexOf(',')));
                }
                if (_junkSide(left) || _junkSide(right)) break;
                const t = { conn: c.conn, family: c.family, origin: 'desc', nodeId: nodeId || '', nodeLabel: nodeLabel || '' };
                if (c.type === 'contrast') {
                    t.type = 'contrast'; t.a = _cap(left); t.b = _cap(right);
                } else if (c.dir === 'ec') {
                    // "X perché Y" → causa Y; MA "A causa di Y, X" → causa Y=left
                    t.cause = atStart ? _cap(left) : _cap(right);
                    t.effect = atStart ? _cap(right) : _cap(left);
                    // La tripla è normalizzata causa→effetto, ma il connettivo
                    // originale legge effetto-prima ("A perché B" ≠ "A quindi B"):
                    // per la VISUALIZZAZIONE serve un connettivo causa-prima.
                    t.connShow = ({ trasformazione: 'quindi', dipendenza: 'permette', sequenza: 'porta a' })[c.family] || 'quindi';
                    if (c.lang === 'en') t.connShow = ({ trasformazione: 'therefore', dipendenza: 'enables', sequenza: 'leads to' })[c.family] || 'therefore';
                } else {
                    t.cause = _cap(left); t.effect = _cap(right);
                    // «permette/permise di + infinito»: mostra il connettivo COMPLETO
                    // ("permette di") — l'effetto è un verbo, senza "di" si legge male
                    // ("permette sviluppare"). Solo DISPLAY: t.conn resta normalizzato
                    // per dedup e per i gruppi di equivalenza del cloze buchi-relazione.
                    if ((c.conn === 'permette' || c.conn === 'permise') && /\sdi\s*$/i.test(m[0])) {
                        t.connShow = c.conn + ' di';
                    }
                }
                out.push(t);
                break; // una tripla per frase
            }
        }
        return out;
    }

    // ── 2. Triple dai link del grafo ────────────────────────────────────────
    function extractLinkTriples(nodes, links, familyMap) {
        const fm = familyMap || FALLBACK_FAMILY_MAP;
        const byId = {};
        (nodes || []).forEach(n => { byId[n.id] = n; });
        const out = [];
        for (const l of (links || [])) {
            const rel = _clean(l.rel).toLowerCase();
            if (!rel) continue;
            const fam = fm[rel];
            if (!fam || !CHAIN_FAMILIES[fam]) continue;
            const s = byId[typeof l.source === 'object' ? l.source.id : l.source];
            const t = byId[typeof l.target === 'object' ? l.target.id : l.target];
            if (!s || !t) continue;
            const tri = {
                conn: _clean(l.rel), family: fam, origin: 'link',
                sourceId: s.id, targetId: t.id
            };
            if (fam === 'opposizione') { tri.type = 'contrast'; tri.a = _clean(s.label); tri.b = _clean(t.label); }
            else { tri.cause = _clean(s.label); tri.effect = _clean(t.label); }
            out.push(tri);
        }
        return out;
    }

    // ── Ramo L1 di appartenenza (parent-walk sui link) ──────────────────────
    function buildParentMap(nodes, links) {
        const level = {};
        (nodes || []).forEach(n => { level[n.id] = n.level || 0; });
        const parent = {};
        for (const l of (links || [])) {
            if (l.isCross) continue;   // i cross-link (Phase 4 / KG) non sono parentela
            const src = typeof l.source === 'object' ? l.source.id : l.source;
            const tgt = typeof l.target === 'object' ? l.target.id : l.target;
            if (!(src in level) || !(tgt in level)) continue;
            // link gerarchico: il genitore sta a un livello più alto (numero più basso)
            if (level[src] < level[tgt] && !(tgt in parent)) parent[tgt] = src;
        }
        return parent;
    }

    function l1Of(id, parentMap, nodesById) {
        let cur = id, guard = 0;
        while (cur && guard++ < 12) {
            const n = nodesById[cur];
            if (!n) return null;
            if ((n.level || 0) === 1) return cur;
            if ((n.level || 0) === 0) return null;
            cur = parentMap[cur];
        }
        return null;
    }

    function _key(t) {
        let a = (t.cause || t.a || '').toLowerCase();
        let b = (t.effect || t.b || '').toLowerCase();
        // contrasto = coppia simmetrica: A↔B e B↔A sono lo stesso nesso
        if (t.type === 'contrast' && a > b) { const tmp = a; a = b; b = tmp; }
        return [t.type || 'c', a, t.conn.toLowerCase(), b].join('|');
    }

    function dedupe(triples) {
        const seen = new Set(); const out = [];
        for (const t of triples) {
            const k = _key(t);
            if (seen.has(k)) continue;
            seen.add(k); out.push(t);
        }
        return out;
    }

    // ── Catena completa della mappa, raggruppata per ramo ───────────────────
    // → { branches: [{id, label, group, items}], cross: [...], total }
    function buildChains(opts) {
        const nodes = (opts && opts.nodes) || [];
        const links = (opts && opts.links) || [];
        const familyMap = opts && opts.familyMap;
        const nodesById = {};
        nodes.forEach(n => { nodesById[n.id] = n; });
        const parentMap = buildParentMap(nodes, links);

        const linkTriples = extractLinkTriples(nodes, links, familyMap);
        let descTriples = [];
        for (const n of nodes) {
            const txt = n.desc || n.content || '';
            if (txt) descTriples = descTriples.concat(extractDescTriples(txt, n.id, _clean(n.label)));
        }

        const branchOf = {};   // branchId → {id,label,group,items}
        const cross = [];      // SOLO ponti dai link (un desc-triple vive in un nodo solo)
        const rootItems = [];  // triple senza ramo L1 (desc del ROOT, KG senza gerarchia)
        const push = (branchId, t) => {
            if (!branchId) { rootItems.push(t); return; }
            if (!branchOf[branchId]) {
                const b = nodesById[branchId];
                branchOf[branchId] = { id: branchId, label: _clean(b && b.label) || branchId, group: (b && b.group) || 0, items: [] };
            }
            branchOf[branchId].items.push(t);
        };

        for (const t of dedupe(linkTriples)) {
            const bs = l1Of(t.sourceId, parentMap, nodesById);
            const bt = l1Of(t.targetId, parentMap, nodesById);
            if (bs && bt && bs !== bt) { cross.push(t); }          // ponte tra rami
            else push(bs || bt, t);
        }
        for (const t of dedupe(descTriples)) {
            push(l1Of(t.nodeId, parentMap, nodesById), t);
        }

        const branches = Object.values(branchOf)
            .map(b => { b.truncated = Math.max(0, b.items.length - MAX_PER_BRANCH); b.items = b.items.slice(0, MAX_PER_BRANCH); return b; })
            .sort((a, b) => (a.group - b.group) || a.label.localeCompare(b.label));
        // stesso cap anche su cross e rootItems: un KG piatto (l1Of sempre null)
        // riversa TUTTO in rootItems e senza limite il documento è illeggibile
        const crossTruncated = Math.max(0, cross.length - MAX_PER_BRANCH);
        const rootTruncated = Math.max(0, rootItems.length - MAX_PER_BRANCH);
        const crossCapped = cross.slice(0, MAX_PER_BRANCH);
        const rootCapped = rootItems.slice(0, MAX_PER_BRANCH);
        const total = branches.reduce((s, b) => s + b.items.length, 0) + crossCapped.length + rootCapped.length;
        return { branches, cross: crossCapped, crossTruncated, rootItems: rootCapped, rootTruncated, total };
    }

    /* ── DOCUMENTO EDITABILE ─────────────────────────────────────────────────
     * L'estrazione è deterministica, quindi grezza: un nesso può avere i lati
     * tagliati male o un connettivo che nel contesto non regge. Da qui il
     * documento diventa un modello editabile, e il docente sistema quello che
     * la macchina ha preso alla lettera.
     *
     * Una riga ha SEMPRE gli stessi tre campi — `left`, `conn`, `right` — anche
     * quando la tripla di partenza è un contrasto (`a`/`b`) invece di una causa
     * (`cause`/`effect`): l'editor mostra tre campi, non due modelli diversi.
     * `tripleFromRow` rimette i nomi originali, così i builder di stampa, le
     * pagine PDF e il blocco della sintesi continuano a leggere le triple che
     * hanno sempre letto.
     * Le etichette delle sezioni arrivano da FUORI (`labels`): il core resta
     * senza lingua. */
    const CHAIN_FAMILY_LIST = ['trasformazione', 'dipendenza', 'sequenza', 'opposizione'];
    function _famOk(f) { return CHAIN_FAMILY_LIST.indexOf(f) >= 0 ? f : 'trasformazione'; }
    function _s(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

    function rowFromTriple(tr) {
        if (!tr) return null;
        const contrast = tr.type === 'contrast';
        return {
            type: contrast ? 'contrast' : 'cause',
            left: _s(contrast ? tr.a : tr.cause),
            right: _s(contrast ? tr.b : tr.effect),
            conn: _s(contrast ? tr.conn : (tr.connShow || tr.conn)),
            family: _famOk(tr.family),
            // 'manual' = riga scritta dal docente: la stampa non le mette il badge
            // «dalla mappa»/«dal testo», che sarebbe una provenienza falsa.
            origin: (tr.origin === 'link' || tr.origin === 'desc') ? tr.origin : 'manual',
            nodeLabel: _s(tr.nodeLabel)
        };
    }
    function tripleFromRow(row) {
        if (!row) return null;
        const base = { conn: _s(row.conn), family: _famOk(row.family), origin: row.origin || 'manual' };
        if (row.nodeLabel) base.nodeLabel = _s(row.nodeLabel);
        if (row.type === 'contrast') return Object.assign(base, { type: 'contrast', a: _s(row.left), b: _s(row.right) });
        return Object.assign(base, { cause: _s(row.left), effect: _s(row.right), connShow: _s(row.conn) });
    }
    function blankRow(family) {
        return { type: 'cause', left: '', right: '', conn: '', family: _famOk(family), origin: 'manual', nodeLabel: '' };
    }

    /** chains (buildChains) → documento editabile a sezioni. */
    function docFromChains(chains, labels) {
        const L = labels || {};
        const secs = [];
        const c = chains || {};
        if (c.rootItems && c.rootItems.length) {
            secs.push({ id: 'root', kind: 'root', label: _s(L.root) || 'In generale', truncated: c.rootTruncated || 0, rows: c.rootItems.map(rowFromTriple) });
        }
        (c.branches || []).forEach(function (b) {
            if (!b || !b.items || !b.items.length) return;
            secs.push({ id: String(b.id), kind: 'branch', label: _s(b.label), group: b.group || 0, truncated: b.truncated || 0, rows: b.items.map(rowFromTriple) });
        });
        if (c.cross && c.cross.length) {
            secs.push({ id: 'cross', kind: 'cross', label: _s(L.cross) || 'Ponti tra i rami', truncated: c.crossTruncated || 0, rows: c.cross.map(rowFromTriple) });
        }
        return { sections: secs, editedAt: null };
    }

    /** Documento editabile → chains, nella forma che i builder già conoscono. */
    function chainsFromDoc(doc) {
        const out = { branches: [], cross: [], crossTruncated: 0, rootItems: [], rootTruncated: 0, total: 0 };
        ((doc && doc.sections) || []).forEach(function (s) {
            const items = (s.rows || []).map(tripleFromRow).filter(function (t) {
                return t && ((t.cause || t.a) && (t.effect || t.b));
            });
            if (!items.length) return;
            if (s.kind === 'root') { out.rootItems = items; out.rootTruncated = s.truncated || 0; }
            else if (s.kind === 'cross') { out.cross = items; out.crossTruncated = s.truncated || 0; }
            else out.branches.push({ id: s.id, label: s.label, group: s.group || 0, items: items, truncated: s.truncated || 0 });
        });
        out.total = out.rootItems.length + out.cross.length +
            out.branches.reduce(function (n, b) { return n + b.items.length; }, 0);
        return out;
    }

    function countRows(doc) {
        return ((doc && doc.sections) || []).reduce(function (n, s) { return n + ((s.rows || []).length); }, 0);
    }

    // Operazioni immutabili (stesso patto degli altri core: mai mutare in luogo,
    // così l'annulla dell'editor tiene solo istantanee).
    function _mapSection(doc, si, fn) {
        const secs = ((doc && doc.sections) || []).map(function (s, i) {
            if (i !== si) return s;
            const copy = Object.assign({}, s);
            copy.rows = fn((s.rows || []).slice());
            return copy;
        });
        return Object.assign({}, doc, { sections: secs });
    }
    const ROW_FIELDS = { left: 1, right: 1, conn: 1, family: 1, type: 1 };
    function setRowField(doc, si, ri, field, value) {
        if (!ROW_FIELDS[field]) return doc;
        return _mapSection(doc, si, function (rows) {
            if (!rows[ri]) return rows;
            const r = Object.assign({}, rows[ri]);
            if (field === 'family') r.family = _famOk(value);
            else if (field === 'type') r.type = (value === 'contrast') ? 'contrast' : 'cause';
            else r[field] = _s(value);
            rows[ri] = r;
            return rows;
        });
    }
    function removeRow(doc, si, ri) {
        return _mapSection(doc, si, function (rows) { if (rows[ri]) rows.splice(ri, 1); return rows; });
    }
    function moveRow(doc, si, ri, dir) {
        const to = ri + (dir < 0 ? -1 : 1);
        return _mapSection(doc, si, function (rows) {
            if (!rows[ri] || to < 0 || to >= rows.length) return rows;
            const tmp = rows[to]; rows[to] = rows[ri]; rows[ri] = tmp;
            return rows;
        });
    }
    function insertRow(doc, si, ri) {
        return _mapSection(doc, si, function (rows) {
            const at = (typeof ri === 'number' && ri >= -1) ? ri + 1 : rows.length;
            rows.splice(Math.min(at, rows.length), 0, blankRow(rows[ri] && rows[ri].family));
            return rows;
        });
    }

    /** Ripulisce: righe del tutto vuote fuori, sezioni rimaste vuote fuori. */
    function normDoc(doc) {
        const secs = ((doc && doc.sections) || []).map(function (s) {
            const rows = (s.rows || []).map(function (r) {
                return {
                    type: r.type === 'contrast' ? 'contrast' : 'cause',
                    left: _s(r.left), right: _s(r.right), conn: _s(r.conn),
                    family: _famOk(r.family),
                    origin: (r.origin === 'link' || r.origin === 'desc') ? r.origin : 'manual',
                    nodeLabel: _s(r.nodeLabel)
                };
            }).filter(function (r) { return r.left || r.right || r.conn; });
            return Object.assign({}, s, { rows: rows });
        }).filter(function (s) { return s.rows.length; });
        return { sections: secs, editedAt: Date.now() };
    }

    /** Problemi da mostrare prima di salvare (non bloccanti: li decide il docente). */
    function validateDoc(doc) {
        const out = [];
        ((doc && doc.sections) || []).forEach(function (s, si) {
            (s.rows || []).forEach(function (r, ri) {
                const where = s.label + ' · ' + (ri + 1);
                if (!_s(r.left) || !_s(r.right)) out.push({ si: si, ri: ri, msg: where + ': manca uno dei due lati del nesso' });
                else if (!_s(r.conn)) out.push({ si: si, ri: ri, msg: where + ': manca il connettivo' });
            });
        });
        return out;
    }

    // ── Scaffold per il prompt della sintesi ────────────────────────────────
    // promptLines = UNICO formattatore riga (usato anche da mappai-causal-chains:
    // niente copie destinate a divergere). Header nella lingua delle mappe.
    const PROMPT_HEADERS = {
        it: 'NESSI CAUSA-EFFETTO GIÀ PRESENTI NEL MATERIALE (usali per collegare i concetti nella sintesi; NON inventarne altri):',
        en: 'CAUSE-EFFECT LINKS ALREADY PRESENT IN THE MATERIAL (use them to connect the concepts in the synthesis; do NOT invent new ones):'
    };
    function promptLines(triples) {
        return (triples || []).map(t => t.type === 'contrast'
            ? '- ' + t.a + ' ↔ ' + t.conn + ' ↔ ' + t.b
            : '- ' + t.cause + ' → ' + (t.connShow || t.conn) + ' → ' + t.effect);
    }
    function promptHeader(lang) { return PROMPT_HEADERS[lang] || PROMPT_HEADERS.it; }

    // Triple ristrette a un insieme di nodi (ramo), formato riga-per-riga.
    // '' se non c'è nulla: il chiamante non aggiunge il blocco.
    // NB: cap silenzioso (default 20) — è uno scaffold per l'AI, non un inventario.
    function promptBlock(nodes, links, familyMap, capN, lang) {
        const cap = capN || 20;
        const ids = new Set((nodes || []).map(n => n.id));
        const linkT = extractLinkTriples(nodes, links, familyMap)
            .filter(t => ids.has(t.sourceId) && ids.has(t.targetId));
        let descT = [];
        for (const n of (nodes || [])) {
            const txt = n.desc || n.content || '';
            if (txt) descT = descT.concat(extractDescTriples(txt, n.id, ''));
        }
        const all = dedupe(linkT.concat(descT)).slice(0, cap);
        if (!all.length) return '';
        return '\n\n' + promptHeader(lang) + '\n' + promptLines(all).join('\n');
    }

    return {
        CONNECTIVES, CHAIN_FAMILIES, FALLBACK_FAMILY_MAP,
        MAX_PER_BRANCH, CHAIN_FAMILY_LIST,
        extractDescTriples, extractLinkTriples,
        buildParentMap, l1Of, dedupe, buildChains,
        promptLines, promptHeader, promptBlock,
        connGroup, connEquivalents,
        // documento editabile
        rowFromTriple, tripleFromRow, blankRow,
        docFromChains, chainsFromDoc, countRows,
        setRowField, removeRow, moveRow, insertRow,
        normDoc, validateDoc
    };
}));
